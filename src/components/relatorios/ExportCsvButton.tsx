'use client'

/**
 * Botão Exportar (CSV) — réplica do botão 'Exportar' (ti-download) presente em todo relatório
 * do legado (rel-acts, legacy/index.html ~6990). Gera o CSV no client a partir das linhas já
 * renderizadas e dispara o download (sem lib externa). Header + linhas em UTF-8 com BOM p/ Excel.
 */
export function ExportCsvButton({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number)[][] }) {
  function esc(v: string | number): string {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  function exportar() {
    const linhas = [headers, ...rows].map((r) => r.map(esc).join(';'))
    const csv = '﻿' + linhas.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button className="btn btn-ghost" type="button" onClick={exportar} disabled={rows.length === 0} title={rows.length === 0 ? 'Sem dados para exportar' : 'Exportar CSV'}>
      <i className="ti ti-download" /> Exportar
    </button>
  )
}
