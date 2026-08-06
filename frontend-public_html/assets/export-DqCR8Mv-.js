function e(e,t,n){let r=new Blob([`﻿`+e],{type:`${n};charset=utf-8`}),i=URL.createObjectURL(r),a=document.createElement(`a`);a.href=i,a.download=t,a.click(),URL.revokeObjectURL(i)}var t=e=>`"${(e==null?``:String(e)).replace(/"/g,`""`)}"`;function n(n,r){if(!r.length)return;let i=Object.keys(r[0]),a=r.map(e=>i.map(n=>t(e[n])).join(`;`)).join(`
`);e(`${i.join(`;`)}\n${a}`,`${n}.csv`,`text/csv`)}function r(t,n){if(!n.length)return;let r=Object.keys(n[0]);e(`<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${r.map(e=>`<th>${e}</th>`).join(``)}</tr></thead><tbody>`+n.map(e=>`<tr>${r.map(t=>`<td>${e[t]===null||e[t]===void 0?``:String(e[t])}</td>`).join(``)}</tr>`).join(``)+`</tbody></table></body></html>`,`${t}.xls`,`application/vnd.ms-excel`)}var i=`
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0;padding:40px;line-height:1.55}
  h1{font-size:26px;margin:0 0 4px}
  h2{font-size:16px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#475569}
  .muted{color:#64748b;font-size:13px}
  .brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f172a;padding-bottom:16px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
  th{text-align:left;background:#f1f5f9;padding:9px 10px;border-bottom:1px solid #e2e8f0}
  td{padding:9px 10px;border-bottom:1px solid #eef2f7}
  .right{text-align:right}
  .totals{margin-top:16px;margin-left:auto;width:290px;font-size:14px}
  .totals div{display:flex;justify-content:space-between;padding:6px 0}
  .totals .grand{border-top:2px solid #0f172a;font-weight:700;font-size:17px;margin-top:6px;padding-top:10px}
  .box{border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-top:12px;white-space:pre-wrap;font-size:13px}
  .sign{margin-top:56px;display:flex;gap:48px}
  .sign div{flex:1;border-top:1px solid #0f172a;padding-top:8px;font-size:12px;color:#475569}
  @media print{body{padding:24px}}
`;function a(e,t){let n=window.open(``,`_blank`,`width=900,height=1000`);n&&(n.document.write(`<html><head><title>${e}</title><meta charset="utf-8"><style>${i}</style></head><body>${t}</body></html>`),n.document.close(),n.focus(),setTimeout(()=>n.print(),350))}export{r as n,a as r,n as t};