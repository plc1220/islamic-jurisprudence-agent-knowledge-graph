import React from 'react';
import type { UsageSummary } from '../../scripts/knowledge/usage';

export function TokenUsage({ usage }: { usage: UsageSummary | null }) {
  return <section className="space-y-3 border-t border-stone-200 pt-4" aria-label="Penggunaan token Gemini">
    <h3 className="text-sm font-semibold">Token Gemini · Pengekstrakan graf</h3>
    {!usage ? <p className="text-sm text-stone-500">Belum ada rekod token untuk tugas ini. Penjejakan tersedia bagi pelaksanaan baharu; penggunaan terdahulu tidak dianggap sifar.</p> : <>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {([
          ['promptTokenCount', 'Input'], ['candidatesTokenCount', 'Output'], ['thoughtsTokenCount', 'Pemikiran'],
          ['cachedContentTokenCount', 'Input daripada cache'], ['toolUsePromptTokenCount', 'Input alat'], ['totalTokenCount', 'Jumlah dilaporkan'],
        ] as const).map(([key, label]) => <div key={key}><dt className="text-stone-500">{label}</dt><dd className="font-semibold tabular-nums">{usage.tokens[key]?.toLocaleString('ms-MY') ?? 'Tidak dilaporkan'}</dd>
          {usage.reportedCalls[key] > 0 && usage.reportedCalls[key] < usage.calls && <span className="text-xs text-stone-500">Sebahagian: {usage.reportedCalls[key]} / {usage.calls} panggilan</span>}
        </div>)}
      </dl>
      <p className="text-xs text-stone-500">{usage.calls.toLocaleString()} panggilan · {usage.retries.toLocaleString()} percubaan semula · {usage.failedRequests.toLocaleString()} permintaan gagal</p>
      {usage.missingUsageCalls > 0 && <p className="text-xs text-amber-800">{usage.missingUsageCalls} panggilan tanpa jumlah token. Jumlah yang dipaparkan tidak lengkap.</p>}
      <p className="text-xs text-stone-500">Direkod sejak {new Date(usage.startedAt).toLocaleString('ms-MY')}. Input cache sudah termasuk dalam input. Tidak termasuk sembang, imbasan sumber atau embedding.</p>
    </>}
  </section>;
}
