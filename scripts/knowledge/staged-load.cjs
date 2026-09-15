function isArticleUrl(value) {
  try { const u=new URL(value); return /^https?:$/.test(u.protocol) && !/\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|map|zip)$/i.test(u.pathname) && !/\/(xmlrpc\.php|wp-json)(\/|$)/i.test(u.pathname); } catch { return false; }
}
async function loadGcsShards(table,storage,uris,bucket,prefix,location) {
  if(!uris.length)return;
  const files=uris.map(uri=>{const m=/^gs:\/\/([^/]+)\/(.+)$/.exec(uri);if(!m || m[1]!==bucket || !m[2].startsWith(prefix) || !m[2].endsWith('.jsonl'))throw new Error('Invalid staged shard URI');return storage.bucket(m[1]).file(m[2]);});
  const [job]=await table.load(files,{sourceFormat:'NEWLINE_DELIMITED_JSON',writeDisposition:'WRITE_TRUNCATE',location});
  if(job?.status?.errorResult)throw new Error(`Staged load failed: ${job.status.errorResult.message}`);
}
module.exports={isArticleUrl,loadGcsShards};
