// Fixed positions on the 48px grid (column, row, delay in seconds). Static on purpose: no hydration drift.
const CELLS: ReadonlyArray<readonly [number, number, number]> = [
  [2, 3, 0], [5, 1, 2.5], [8, 5, 5], [11, 2, 1.2], [14, 6, 3.8], [17, 3, 6.4],
  [20, 7, 0.8], [23, 2, 4.4], [26, 5, 7.2], [3, 9, 3.1], [7, 12, 6.1], [12, 10, 1.9],
  [16, 13, 4.9], [21, 11, 0.3], [25, 14, 5.6], [29, 9, 2.2], [4, 16, 7.6], [10, 17, 3.5],
  [18, 16, 1.5], [24, 18, 6.8], [28, 15, 4.1], [31, 4, 5.3], [33, 12, 0.6], [1, 14, 2.9],
  [36, 8, 2.4], [38, 3, 6.6], [40, 14, 1.1], [35, 17, 4.7], [42, 10, 7.9], [37, 21, 3.3],
  [6, 21, 5.8], [13, 22, 0.9], [22, 23, 2.7], [30, 22, 6.2], [0, 7, 4.5], [9, 0, 7.1],
];

export function BoardBackground() {
  return (
    <div className="board" aria-hidden="true">
      <div className="board__layer">
        {CELLS.map(([col, row, delay]) => (
          <span
            key={`${col}-${row}`}
            className="board__cell"
            style={{
              left: `calc(var(--cell) * ${col})`,
              top: `calc(var(--cell) * ${row})`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
