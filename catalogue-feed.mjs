import { cleanMetadata } from "./catalogue-metadata.mjs";
import { SaxesParser } from 'saxes';
import { publicUrl } from './safe-network.mjs';
import { publisherRightsEvidence } from './rights-assessment.mjs';
import { transcriptRefsFromItem } from './transcripts.mjs';
export class FeedError extends Error {
  constructor(code, message) { super(message); this.code = code; this.status = 502; }
}
const escape = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const serialize = n => typeof n === 'string' ? escape(n) : `<${n.name}${Object.entries(n.attributes).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${n.children.map(serialize).join('')}</${n.name}>`;
const text = n => !n ? '' : typeof n === 'string' ? n : n.children.map(text).join('');
const child = (n, name) => n.children.find(c => typeof c !== 'string' && c.name === name);
const value = (n, name) => text(child(n,name)).trim();
const clean = cleanMetadata;
export function parseFeed(xml, feedUrl, limit = 30, now = Date.now()) {
  if (Buffer.byteLength(xml) > 8_000_000) throw new FeedError('FEED_TOO_LARGE','Publisher feed exceeds the supported size.');
  let root, stack=[], nodes=0;
  const parser = new SaxesParser({xmlns:false});
  parser.on('doctype',()=>{throw Error('Document types are not supported');});
  parser.on('opentag',tag=>{
    if (++nodes > 150000 || stack.length >= 64) throw Error('XML complexity limit');
    const namespaces = {...stack.at(-1)?.namespaces};
    for (const [name, uri] of Object.entries(tag.attributes)) {
      if (name === 'xmlns') namespaces[''] = uri;
      else if (name.startsWith('xmlns:')) namespaces[name.slice(6)] = uri;
    }
    const colon = tag.name.indexOf(':'), prefix = colon < 0 ? '' : tag.name.slice(0,colon);
    const name = namespaces[prefix] === 'http://www.w3.org/2005/Atom' ? tag.name.slice(colon+1) : tag.name;
    const node={name,attributes:tag.attributes,children:[],namespaces};
    if(stack.length) stack.at(-1).children.push(node); else root=node;
    stack.push(node);
  });
  const append = t => { if(stack.length) stack.at(-1).children.push(t); };
  parser.on('text',append); parser.on('cdata',append); parser.on('closetag',()=>stack.pop());
  try { parser.write(xml).close(); } catch { throw new FeedError('MALFORMED_FEED','The publisher returned malformed or unsupported XML.'); }
  const channel = root?.name === 'rss' ? child(root,'channel') : root?.name === 'feed' ? root : null;
  if(!channel) throw new FeedError('MALFORMED_FEED','A complete RSS or Atom feed is required.');
  const items=channel.children.filter(n=>typeof n!=='string' && ['item','entry'].includes(n.name));
  const channelXml=serialize({...channel,children:channel.children.filter(n=>!items.includes(n))});
  const diagnostics=[];
  const episodes=items.map(n=>{
    const enclosure=child(n,'enclosure') || n.children.find(c=>c.name==='link' && c.attributes.rel==='enclosure');
    const audio=enclosure?.attributes.url || enclosure?.attributes.href || '';
    const type=enclosure?.attributes.type;
    const audioUrl=publicUrl(audio) && (!type || /^(audio\/|application\/octet-stream)/i.test(type)) ? audio : null;
    const id=value(n,'guid') || value(n,'id') || audio || null;
    const itemXml=serialize(n), description=value(n,'description')||value(n,'summary')||value(n,'content');
    const refs=transcriptRefsFromItem(itemXml);
    for(const match of description.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[^<]*transcript[^<]*<\/a>/gi)) {
      const url=match[1].replace(/&amp;/g,'&');
      if(publicUrl(url)) refs.push({url,type:/\.vtt(?:\?|$)/i.test(url)?'text/vtt':/\.srt(?:\?|$)/i.test(url)?'application/x-subrip':'text/html',language:'und'});
    }
    if(!audioUrl) diagnostics.push({episodeId:id,code:'INVALID_AUDIO_ENCLOSURE'});
    return {id,title:clean(value(n,'title'))||'Untitled episode',publishedAt:value(n,'pubDate')||value(n,'published')||value(n,'updated'),duration:value(n,'itunes:duration'),description:clean(description),audioUrl,
      withdrawn:/^(true|yes|1)$/i.test(value(n,'podcast:withdrawn')||value(n,'withdrawn')),hasPublisherTranscript:refs.length>0,
      rightsEvidence:publisherRightsEvidence({channelXml,itemXml,feedUrl}),refs};
  });
  const published = e => {const t=Date.parse(e.publishedAt); return Number.isFinite(t)&&t<=now?t:-Infinity;};
  episodes.sort((a,b)=> (published(b)-published(a)||String(a.id).localeCompare(String(b.id))||String(a.audioUrl).localeCompare(String(b.audioUrl))));
  const unique=new Map();
  for(const e of episodes) {
    if(!e.id) continue;
    const previous=unique.get(e.id);
    if(!previous) unique.set(e.id,e);
    else if(previous.audioUrl!==e.audioUrl || JSON.stringify(previous.rightsEvidence)!==JSON.stringify(e.rightsEvidence)) { previous.identityConflict=true; previous.audioUrl=null; diagnostics.push({episodeId:e.id,code:'IDENTITY_CONFLICT'}); }
  }
  const art=child(channel,'itunes:image')?.attributes.href || value(child(channel,'image')||{children:[]},'url') || value(channel,'logo');
  return {title:clean(value(channel,'title')),publisher:clean(value(channel,'itunes:author')||value(channel,'author')),art:publicUrl(art)?art:null,canonicalFeedUrl:feedUrl,
    episodes:[...unique.values()].filter(e=>!Number.isFinite(Date.parse(e.publishedAt))||Date.parse(e.publishedAt)<=now).slice(0,limit),diagnostics};
}
