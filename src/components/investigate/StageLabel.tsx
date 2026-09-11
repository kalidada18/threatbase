/** Section header in the Raku world's voice: the numbered kiln-log stage.
 *  Shared by every dossier panel so one firing sequence numbers the surface. */
export function StageLabel({ n, name }: { n: string; name: string }) {
  return (
    <div className="kiln">
      <span>
        <span className="kiln-n">STAGE {n}</span>
        <span aria-hidden className="mx-2 opacity-60">·</span>
        {name}
      </span>
    </div>
  )
}
