import { Construction } from 'lucide-react'

export function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="lc-card flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-500">
        <Construction size={26} />
      </div>
      <h2 className="lc-title">{title}</h2>
      <p className="max-w-md text-sm text-ink/60">
        {note ?? 'Módulo em construção. O esqueleto do sistema está pronto  esta tela será implementada conforme o backlog (docs/BACKLOG.md).'}
      </p>
    </div>
  )
}
