export async function refreshFollowedCatalogue(shows, load, accept, {active=()=>true, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  const feeds=shows.filter(show=>show.feedUrl);
  for(let index=0;active()&&index<feeds.length;index+=3) {
    const results=await Promise.allSettled(feeds.slice(index,index+3).map(async show=>({show,feed:await load(show.feedUrl)})));
    if(!active())return;
    accept(results.filter(result=>result.status==='fulfilled').map(result=>result.value));
    await pause(150);
  }
}
