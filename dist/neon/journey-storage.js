import {createNeonModel} from './model.js';

/** Game saves only. Call getBackup() before loading or autosaving the current slot
 * so an interrupted transaction is recovered before newer progress is persisted. */
export function createJourneyStorage({storage,key,layout}) {
  const previousKey=key+'-previous',recoveryKey=key+'-recovery';
  const fresh=createNeonModel(layout).serialize();
  function sanitize(snapshot) {
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||snapshot.version!==1||snapshot.worldId!==layout.id)
      throw new Error('This journey belongs to a different or invalid save.');
    return createNeonModel(layout,snapshot).serialize();
  }
  function parseBackup(raw) {
    if(raw===null)return null;
    try{return sanitize(JSON.parse(raw));}catch{return null;}
  }
  function hasProgress(snapshot) {
    if(snapshot.completed||snapshot.secrets.length||snapshot.chimes.length||snapshot.traversal.visited.length||snapshot.traversal.gardenAwake||snapshot.engine.started||snapshot.engine.beats)return true;
    if(Object.values(snapshot.batteries).some(b=>b.status!=='waiting'))return true;
    if(Object.entries(snapshot.mirrors).some(([id,m])=>m.rotation!==fresh.mirrors[id].rotation))return true;
    return Object.entries(snapshot.jellies).some(([id,j])=>j.status!=='waiting'||Math.hypot(j.x-fresh.jellies[id].x,j.z-fresh.jellies[id].z)>.001);
  }
  function rollback(journal) {
    if(journal.previous===null)storage.removeItem(previousKey);else storage.setItem(previousKey,journal.previous);
    storage.setItem(key,journal.current);
    storage.removeItem(recoveryKey);
  }
  function recoverPending() {
    const raw=storage.getItem(recoveryKey);if(raw===null)return;
    let journal;
    try {
      journal=JSON.parse(raw);
      if(journal?.version!==1||journal.worldId!==layout.id||typeof journal.current!=='string'||!(journal.previous===null||typeof journal.previous==='string'))throw new Error();
      // Validate before any write; an unrelated/corrupt journal cannot replace a journey.
      sanitize(JSON.parse(journal.current));
    }catch{throw new Error('The saved recovery record could not be read. Existing journeys were kept.');}
    rollback(journal);
  }
  function persist(current,previousRaw,target,nextPrevious) {
    const journal={version:1,worldId:layout.id,current:JSON.stringify(current),previous:previousRaw};
    // The journal retains both originals even if persistence AND rollback are blocked.
    storage.setItem(recoveryKey,JSON.stringify(journal));
    try {
      storage.setItem(previousKey,JSON.stringify(nextPrevious));
      storage.setItem(key,JSON.stringify(target));
      storage.removeItem(recoveryKey); // Commit: nothing that can fail follows this removal.
    }catch(cause){
      let recoveryPending=false;
      try{rollback(journal);}catch{recoveryPending=true;}
      const error=new Error('The journey could not be saved. Your current journey was kept.',{cause});
      error.recoveryPending=recoveryPending;throw error;
    }
    return target;
  }
  return {
    getBackup(){recoverPending();return parseBackup(storage.getItem(previousKey));},
    reset(currentSnapshot){
      recoverPending();const current=sanitize(currentSnapshot),previousRaw=storage.getItem(previousKey),previous=parseBackup(previousRaw);
      const nextPrevious=hasProgress(current)||!previous?current:previous;
      return persist(current,previousRaw,createNeonModel(layout).serialize(),nextPrevious);
    },
    restore(currentSnapshot){
      recoverPending();const current=sanitize(currentSnapshot),previousRaw=storage.getItem(previousKey),previous=parseBackup(previousRaw);
      if(!previous)throw new Error('No valid previous journey is available.');
      return persist(current,previousRaw,previous,hasProgress(current)?current:previous);
    }
  };
}
