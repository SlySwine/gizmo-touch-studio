import { Color, HalfFloatType, LinearSRGBColorSpace, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';

// Official, unmodified Three.js r180 addons live in vendor/postprocessing and
// vendor/shaders; their MIT notice is retained in vendor/THREE-LICENSE.txt.
const LOOKS = {
  garden: { strength: .13, threshold: 1.35, radius: .20, saturation: .985 },
  coast: { strength: .12, threshold: 1.45, radius: .18, saturation: .985 },
  glacier: { strength: .09, threshold: 1.65, radius: .16, saturation: .98 },
  volcano: { strength: .13, threshold: 1.65, radius: .20, saturation: .98 },
  ruins: { strength: .10, threshold: 1.60, radius: .18, saturation: .99 }
};

/** Garden-only HDR rendering; resize receives the canvas size in CSS pixels. */
export function createGardenRenderer({ renderer, scene, camera, coarse = false }) {
  const initialSize = renderer.getSize(new Vector2());
  const clearColor = new Color();
  const hdr = renderer.extensions.has('EXT_color_buffer_float');
  const pixelBudget = coarse ? 850000 : 2250000;
  const maxRatio = coarse ? 1.25 : 1.5;
  let width = 1, height = 1, bufferWidth = 1, bufferHeight = 1, pixelRatio = 1;
  let disposed = false, biome = 'garden';
  let composer = null, renderPass = null, bloom = null, output = null;

  if (hdr) {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: coarse ? 0 : Math.min(2, renderer.capabilities.maxSamples || 0)
    });
    target.texture.name = 'Garden.HDR';
    target.texture.colorSpace = LinearSRGBColorSpace;
    target.texture.generateMipmaps = false;
    composer = new EffectComposer(renderer, target);
    // Own the internal pixel budget without changing the studio's canvas/DPR.
    composer.setPixelRatio(1);
    renderPass = new RenderPass(scene, camera);
    bloom = new UnrealBloomPass(new Vector2(64, 64), .13, .20, 1.35);
    bloom.highPassUniforms.smoothWidth.value = .12;
    const setBloomSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => {
      const scale = coarse ? .55 : .75;
      // All five bloom mips retain at least a single pixel in tiny viewports.
      setBloomSize(Math.max(32, Math.round(w * scale)), Math.max(32, Math.round(h * scale)));
    };
    output = new OutputPass();
    output.uniforms.gardenSaturation = { value: LOOKS.garden.saturation };
    output.uniforms.gardenVignette = { value: coarse ? .045 : .06 };
    output.uniforms.gardenGrain = { value: coarse ? .0012 : .0018 };
    // Fold the restrained finish into OutputPass, avoiding another full-size
    // framebuffer/pass. Linear HDR values remain unclipped until ACES below.
    output.material.fragmentShader = output.material.fragmentShader
      .replace('uniform sampler2D tDiffuse;', `uniform sampler2D tDiffuse;
        uniform float gardenSaturation;
        uniform float gardenVignette;
        uniform float gardenGrain;`)
      .replace('// tone mapping', `
        float gardenLuma = dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722));
        gl_FragColor.rgb = mix(vec3(gardenLuma), gl_FragColor.rgb, gardenSaturation);
        vec2 gardenEdge = (vUv - .5) * 2.0;
        float gardenFalloff = smoothstep(.25, 1.8, dot(gardenEdge, gardenEdge));
        gl_FragColor.rgb *= 1.0 - gardenVignette * gardenFalloff;
        // Fixed, sub-pixel grain prevents flat-gradient banding without shimmer.
        float gardenNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) - .5;
        gl_FragColor.rgb = max(vec3(0.0), gl_FragColor.rgb + gardenNoise * gardenGrain * min(gardenLuma + .025, .7));
        // tone mapping`);
    output.material.needsUpdate = true;
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(output);
  }

  function setEnvironment(layout) {
    const requested = layout?.environment?.biome || layout?.biome || 'garden';
    biome = Object.prototype.hasOwnProperty.call(LOOKS, requested) ? requested : 'garden';
    if (!bloom || disposed) return;
    const look = LOOKS[biome];
    bloom.strength = look.strength * (coarse ? .8 : 1);
    bloom.threshold = look.threshold;
    bloom.radius = look.radius;
    output.uniforms.gardenSaturation.value = look.saturation;
  }

  function resize(nextWidth, nextHeight) {
    if (disposed) return;
    width = Number.isFinite(nextWidth) ? Math.max(1, Math.round(nextWidth)) : 1;
    height = Number.isFinite(nextHeight) ? Math.max(1, Math.round(nextHeight)) : 1;
    pixelRatio = Math.min(renderer.getPixelRatio(), maxRatio, Math.sqrt(pixelBudget / (width * height)));
    const nextBufferWidth = Math.max(1, Math.round(width * pixelRatio));
    const nextBufferHeight = Math.max(1, Math.round(height * pixelRatio));
    if (nextBufferWidth === bufferWidth && nextBufferHeight === bufferHeight) return;
    bufferWidth = nextBufferWidth;
    bufferHeight = nextBufferHeight;
    composer?.setSize(bufferWidth, bufferHeight);
  }

  function render() {
    if (disposed) return false;
    if (!composer) {
      // A device without renderable half-float still gets correct native ACES.
      renderer.render(scene, camera);
      return true;
    }
    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    try {
      // r180 keeps render-target beauty passes linear. OutputPass reads the
      // renderer's ACES/exposure/sRGB settings and applies each exactly once.
      composer.render(0);
    } finally {
      renderer.setRenderTarget(target);
      renderer.autoClear = autoClear;
      renderer.setClearColor(clearColor, clearAlpha);
    }
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderPass?.dispose();
    // r180's bloom.dispose() omits this separately owned extraction material.
    bloom?.materialHighPassFilter.dispose();
    bloom?.dispose();
    output?.dispose();
    composer?.dispose();
  }

  setEnvironment();
  resize(initialSize.x, initialSize.y);
  return Object.freeze({
    resize, render, dispose, setEnvironment,
    get state() {
      return Object.freeze({
        enabled: !!composer && !disposed, hdr, biome, width, height,
        bufferWidth, bufferHeight, pixelRatio,
        bloomStrength: bloom?.strength || 0, bloomThreshold: bloom?.threshold || 0
      });
    }
  });
}
