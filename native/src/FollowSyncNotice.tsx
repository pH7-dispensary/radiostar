import React, {useEffect,useState} from 'react';
import {AppState, Pressable, Text} from 'react-native';
import {followPersistenceFailed,followOperations,retryFollows,subscribeFollowSync} from './followSync';
import type {ListenerState} from './listenerState';
export function FollowSync({setState}: {setState: React.Dispatch<React.SetStateAction<ListenerState>>}) {
  const [pending,setPending]=useState(0);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;
    const refresh=()=>{
      if(!active)return;
      const operations=Object.values(followOperations());
      setPending(operations.filter(op=>op.pending).length);
      setFailed(followPersistenceFailed() || operations.some(op=>op.pending&&op.error));
      setState(state=>{
        let following=state.following, intelligence=state.followIntelligence;
        for(const op of operations) {
          const present=following.some(show=>show.feedUrl===op.feedUrl);
          if(op.show && op.following && !present) following=[op.show,...following];
          if(!op.following && present) following=following.filter(show=>show.feedUrl!==op.feedUrl);
          if(op.processing && intelligence[op.feedUrl]!==op.processing) intelligence={...intelligence,[op.feedUrl]:op.processing};
        }
        return following===state.following && intelligence===state.followIntelligence ? state : {...state,following,followIntelligence:intelligence};
      });
    };
    const retry=()=>{void retryFollows().then(refresh).catch(()=>{if(active)setFailed(true);});};
    const unsubscribe=subscribeFollowSync(refresh);
    const timer=setInterval(retry,15000);
    const subscription=AppState.addEventListener('change',s=>{if(s==='active')retry();});
    retry();
    return()=>{active=false;unsubscribe();clearInterval(timer);subscription.remove();};
  },[setState]);
  if(!pending&&!failed)return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Retry following synchronisation" onPress={()=>void retryFollows().catch(()=>setFailed(true))} style={{paddingHorizontal:20,paddingVertical:8}}>
    <Text accessibilityLiveRegion="polite" style={{color:'#7860a5',fontSize:12}}>{followPersistenceFailed()?'Couldn’t save this change. Please try following again.':failed?'Following changes waiting for connection · Retry':`${pending} following change${pending===1?'':'s'} syncing…`}</Text>
  </Pressable>;
}
