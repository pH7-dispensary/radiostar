// Compare the captured authenticated API references with stored canonical speech.
// No paid model request, transcript export or database mutation.
import{execFileSync}from'node:child_process';
import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
import{verifyAwsIdentity}from'../aws-account-guard.mjs';
verifyAwsIdentity();
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--profile','radiostar','--region','eu-west-2','--output','json'],{encoding:'utf8',timeout:30000}));
const instance=JSON.parse(execFileSync('.starcast/tools/terraform',['-chdir=infra/aws','output','-json'],{encoding:'utf8'})).instance_id.value;
if(!aws(['ec2','describe-instances','--instance-ids',instance]).Reservations[0].Instances[0].Tags.some(t=>t.Key==='Project'&&t.Value==='StarCast'))throw Error('Wrong instance');
if(process.argv[2]==='poll'){
 const r=aws(['ssm','get-command-invocation','--command-id',process.argv[3],'--instance-id',instance]);
 if(r.Status!=='Success')throw Error('Citation check '+r.Status);
 const value=JSON.parse(r.StandardOutputContent);writeFileSync('evals/intelligence-engine-search-integrity.json',JSON.stringify(value,null,2)+'\n');
 console.log({checked:value.checked,invalid:value.invalid});if(value.invalid)process.exitCode=1;
}else{
 const file=readFileSync('evals/intelligence-engine-search.json','utf8'),input=JSON.parse(file);
 const evidence=existsSync('evals/intelligence-engine-global-search.json')?[...input.results,{search:JSON.parse(readFileSync('evals/intelligence-engine-global-search.json','utf8')).result,moment:{moments:[]}}]:input.results;
 const refs=evidence.flatMap(r=>[...r.search.matches,...r.moment.moments].map(m=>({feedUrl:m.episode.feedUrl||r.feedUrl,episodeId:m.episode.id,segmentId:m.segmentId,startMs:m.startMs,endMs:m.endMs,context:m.context,version:m.sourceTranscriptVersion})));
 const source=`import{DatabaseSync}from'node:sqlite';const db=new DatabaseSync('/var/lib/starcast/backend.sqlite',{readOnly:true});const jobs=db.prepare("SELECT payload FROM records WHERE kind='intelligence'").all().map(r=>JSON.parse(r.payload));const refs=${JSON.stringify(refs)};const checks=refs.map(r=>{const j=jobs.find(j=>j.episodeId===r.episodeId&&j.feedUrl===r.feedUrl),t=j?.transcript,s=t?.segments.find(s=>s.id===r.segmentId),quote=String(r.context||'').replace(/(?:…|\\.\\.\\.)$/,'').trim();return{episodeId:r.episodeId,segmentId:r.segmentId,timestampMatches:!!s&&s.startMs===r.startMs&&s.endMs===r.endMs,quoteMatches:!!s&&quote.length>0&&s.text.includes(quote),versionMatches:!!t&&t.transcriptVersion===r.version};});console.log(JSON.stringify({at:new Date().toISOString(),apiEvidenceSha256:'${createHash('sha256').update(file).digest('hex')}',referencesSha256:'${createHash('sha256').update(JSON.stringify(refs)).digest('hex')}',checked:checks.length,invalid:checks.filter(c=>!c.timestampMatches||!c.quoteMatches||!c.versionMatches).length,checks}));db.close();`;
 const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
 const r=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters',JSON.stringify({commands:['/usr/local/bin/node --input-type=module -e '+q(source)],executionTimeout:['60']})]);console.log({commandId:r.Command.CommandId});
}
