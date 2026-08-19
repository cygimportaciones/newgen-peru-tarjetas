export function NewgenMark({ compact = false }: { compact?: boolean }) {
  return <svg viewBox="0 0 300 118" className={compact ? 'newgen-svg newgen-svg-compact' : 'newgen-svg'} role="img" aria-label="NG NewgenPeru">
    <path d="M4 4h39l78 73V4h28v110h-37L32 39v75H4V4Z" />
    <path d="M165 3h131v20h-102v28h102v20h-70v23h35v20h-62c-21 0-34-14-34-35V48h29v31c0 10 5 15 15 15h17V71h-33V51h33V23h-61V3Z" />
  </svg>
}
