import {BlockList,isIP} from 'node:net';
import {createHash} from 'node:crypto';
const normalise = value => {
  const ip=String(value||'').replace(/^::ffff:(?=\d+\.)/,'');
  if(!isIP(ip))return null;
  return isIP(ip)===6?new URL(`http://[${ip}]/`).hostname.slice(1,-1):ip;
};
export function viewerIdentity(req, env={}) {
  const peer=normalise(req.socket.remoteAddress)||'unknown';
  if(env.STARCAST_TRUST_CLOUDFRONT_VPC!=='enabled')return {key:peer,source:'socket'};
  const [address,prefix]=String(env.STARCAST_TRUSTED_PROXY_CIDR||'').split('/');
  const block=new BlockList();
  try {block.addSubnet(address,Number(prefix),isIP(address)===6?'ipv6':'ipv4');} catch {return {key:peer,source:'socket'};}
  if(!isIP(peer)||!block.check(peer,isIP(peer)===6?'ipv6':'ipv4')||typeof req.headers['x-amz-cf-id']!=='string')return {key:peer,source:'socket'};
  // In the verified direct CloudFront VPC origin path there is no ALB or second
  // proxy. CloudFront appends the TCP viewer to XFF; client-supplied prefixes
  // cannot select this rightmost address. Network SG restriction is essential.
  const forwarded=req.headers['x-forwarded-for'];
  const viewer=typeof forwarded==='string'&&forwarded.length<=4096?normalise(forwarded.split(',').at(-1).trim()):null;
  return viewer?{key:viewer,source:'cloudfront-vpc'}:{key:peer,source:'socket'};
}
export class RequestLimits {
  constructor({now=Date.now,maxBuckets=10000}={}){this.now=now;this.maxBuckets=maxBuckets;this.buckets=new Map();}
  take(key,limit,ms){
    const now=this.now();let bucket=this.buckets.get(key);
    if(!bucket||bucket.until<=now){
      if(this.buckets.size>=this.maxBuckets){for(const [id,b] of this.buckets)if(b.until<=now)this.buckets.delete(id);if(this.buckets.size>=this.maxBuckets)return false;}
      bucket={count:0,until:now+ms};this.buckets.set(key,bucket);
    }
    if(bucket.count>=limit)return false;bucket.count++;return true;
  }
  permit(req,{env,kind='api',listenerId=null}={}) {
    const viewer=viewerIdentity(req,env), globalLimit=kind==='api'?6000:80, perLimit=kind==='api'?120:8, window=kind==='api'?60000:900000;
    // Global ceiling applies even when valid identities or viewers rotate.
    if(!this.take(`global:${kind}`,globalLimit,window))return false;
    const identity=kind==='api'&&listenerId?`listener:${listenerId}`:`viewer:${viewer.key}`;
    const key=createHash('sha256').update(identity).digest('hex');
    return this.take(`${kind}:${key}`,perLimit,window);
  }
}
