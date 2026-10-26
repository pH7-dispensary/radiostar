// AWS origin-facing ranges verified 2026-10-26T16:22:57.802Z; refreshed at cloud startup.
// Network access must also remain restricted to the dedicated CloudFront VPC service SG.
export const verifiedRanges = [
  "130.176.88.0/21",
  "54.239.134.0/23",
  "52.82.134.0/23",
  "130.176.86.0/23",
  "130.176.140.0/22",
  "130.176.0.0/18",
  "54.239.204.0/22",
  "130.176.160.0/19",
  "70.132.0.0/18",
  "15.158.0.0/16",
  "130.176.136.0/23",
  "54.239.170.0/23",
  "130.176.96.0/19",
  "51.74.21.0/24",
  "54.182.184.0/22",
  "204.246.166.0/24",
  "130.176.64.0/21",
  "54.182.172.0/22",
  "205.251.218.0/24",
  "130.176.144.0/20",
  "54.182.176.0/21",
  "130.176.78.0/23",
  "54.182.248.0/22",
  "64.252.128.0/18",
  "51.74.22.0/24",
  "54.182.154.0/23",
  "64.252.64.0/18",
  "54.182.144.0/21",
  "54.182.224.0/21",
  "130.176.128.0/21",
  "52.46.0.0/18",
  "3.172.64.0/18",
  "52.82.128.0/23",
  "18.68.0.0/16",
  "54.182.156.0/22",
  "54.182.160.0/21",
  "54.182.240.0/21",
  "51.74.20.0/24",
  "130.176.192.0/19",
  "130.176.76.0/24",
  "54.239.208.0/21",
  "54.182.188.0/23",
  "24.110.128.0/17",
  "3.172.0.0/18",
  "130.176.80.0/22",
  "54.182.128.0/20",
  "130.176.72.0/22",
  "13.124.199.0/24",
  "3.29.57.0/26"
];
export const verifiedAt = "2026-10-26T16:22:57.803Z";
export async function cloudFrontProxyRanges(fetcher=fetch, now=Date.now()) {
  try {
    const response=await fetcher('https://ip-ranges.amazonaws.com/ip-ranges.json',{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('AWS ranges unavailable');
    const data=await response.json();
    const ranges=data.prefixes.filter(p=>p.service==='CLOUDFRONT_ORIGIN_FACING').map(p=>p.ip_prefix);
    if(!ranges.length || ranges.length>256 || ranges.some(c=>!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(c)))throw Error('Invalid AWS ranges');
    return ranges;
  } catch {
    // A brief AWS metadata outage must not interrupt the existing service.
    // Refuse stale trust after seven days instead of widening the boundary.
    if(now-Date.parse(verifiedAt)>7*86400000)throw Error('CloudFront peer ranges could not be verified; refresh the verified snapshot.');
    return verifiedRanges;
  }
}
