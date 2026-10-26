import { FollowOutbox } from './followOutbox.mjs';
import { readLocalDocument, writeLocalDocument, localPrivacyState } from './localStorage';
import { listenerRequest } from './listenerApi';
const subscribers = new Set<() => void>();
let revision = localPrivacyState().revision;
let queue: FollowOutbox;
let persistenceError = false;
export const followPersistenceFailed = () => persistenceError;
function current() {
  const privacy = localPrivacyState();
  if (!queue || revision !== privacy.revision) {
    revision = privacy.revision;
    persistenceError = false;
    const captured = revision;
    queue = new FollowOutbox({
      read: () => readLocalDocument('star-cast-follow-outbox-v1'),
      write: (raw: string) => {
        if(localPrivacyState().paused || captured !== localPrivacyState().revision) throw Error('Local profile was removed.');
        return writeLocalDocument('star-cast-follow-outbox-v1',raw);
      },
      send: (operation: any) => {
        if(localPrivacyState().paused || captured !== localPrivacyState().revision) throw Error('Local profile was removed.');
        return listenerRequest('/api/listener/follow', {feedUrl:operation.feedUrl,following:operation.following,version:operation.version});
      },
      changed: () => subscribers.forEach(fn=>fn()),
    });
  }
  return queue;
}
export const subscribeFollowSync = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; };
export const followOperations = () => current().data.operations as Record<string,any>;
export async function retryFollows() {
  if(localPrivacyState().paused)return;
  await current().flush();
  subscribers.forEach(fn=>fn());
}
export async function queueFollow(feedUrl: string, following: boolean, show?: unknown) {
  try { await current().enqueue(feedUrl,following,show); persistenceError = false; }
  catch (error) { persistenceError = true; subscribers.forEach(fn=>fn()); throw error; }
  void retryFollows().catch(()=>{});
  return {following,feedUrl,processing:{state:'QUEUED' as const,code:'FOLLOW_PENDING',reason:'Following change is waiting to sync.'}};
}
