const glyphs = {
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  t: ["00100", "00100", "11111", "00100", "00100", "00100", "00011"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
};

const wordmark = (["k", "a", "n", "t", "h", "a"] as const).map((letter) =>
  glyphs[letter].flatMap((row, y) =>
    Array.from(row.matchAll(/1+/g), (match) => ({
      columns: `${match.index + 1} / span ${match[0].length}`,
      row: y + 1,
    })),
  ),
);

export function EmptyState() {
  return (
    <h1 className="kantha-chat-wordmark">
      <span className="sr-only">Kantha</span>
      {wordmark.map((letter, index) => (
        <span key={index} className="kantha-chat-glyph" aria-hidden="true">
          {letter.map(({ columns, row }) => (
            <span key={columns + ":" + row} style={{ gridColumn: columns, gridRow: row }} />
          ))}
        </span>
      ))}
    </h1>
  );
}
