import {BackupWorker} from './backup-worker.mjs';
const [database,directory]=process.argv.slice(2);
const client={send:async(_command,{abortSignal})=>{process.send?.({uploadStarted:true});await new Promise((_,reject)=>abortSignal.addEventListener('abort',()=>reject(Error('Simulated 60-second upload failure')),{once:true}));}};
const keepAlive=setInterval(()=>{},1000);
try{await new BackupWorker({database,directory,bucket:'isolated',client,maxAttempts:1,attemptMs:60000}).run();process.exitCode=1;}catch{process.send?.({expectedFailure:true});}

clearInterval(keepAlive);
