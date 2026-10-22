/** A board with a PIN and students joining: what a session looks like. Colors come from the design tokens. */
export function IntroIllustration() {
  const pin = ["4", "8", "2", "9", "1", "3"];
  const students = [
    { name: "Rani", x: 32 },
    { name: "Dimas", x: 120 },
    { name: "Putri", x: 216 },
  ];

  return (
    <svg
      viewBox="0 0 400 280"
      role="img"
      aria-label="Papan kelas menampilkan PIN 482913 dan tiga siswa yang sudah bergabung"
      className="h-auto w-full"
    >
      <rect x="1" y="1" width="398" height="278" rx="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
      <text x="32" y="48" fontSize="13" fontWeight="600" fill="var(--muted)" fontFamily="var(--font-sans)">
        PIN SESI · X RPL 1
      </text>

      {pin.map((digit, index) => (
        <g key={index}>
          <rect x={32 + index * 56} y="64" width="48" height="64" rx="12" fill="var(--primary-tint)" stroke="var(--primary)" strokeWidth="2" />
          <text
            x={56 + index * 56}
            y="108"
            fontSize="32"
            fontWeight="500"
            textAnchor="middle"
            fill="var(--primary)"
            fontFamily="var(--font-mono)"
          >
            {digit}
          </text>
        </g>
      ))}

      <line x1="32" y1="156" x2="368" y2="156" stroke="var(--border)" strokeWidth="2" />
      <text x="32" y="184" fontSize="13" fontWeight="600" fill="var(--muted)" fontFamily="var(--font-sans)">
        SUDAH BERGABUNG · 28 DARI 32
      </text>

      {students.map(({ name, x }) => (
        <g key={name}>
          <rect x={x} y="200" width="80" height="40" rx="8" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
          <path d={`M${x + 12} 220 l5 5 l9 -10`} fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x={x + 34} y="225" fontSize="14" fontWeight="500" fill="var(--ink)" fontFamily="var(--font-sans)">
            {name}
          </text>
        </g>
      ))}
      <rect x="312" y="200" width="56" height="40" rx="8" fill="var(--primary-tint)" />
      <text x="340" y="225" fontSize="14" fontWeight="600" textAnchor="middle" fill="var(--primary)" fontFamily="var(--font-sans)">
        +25
      </text>
    </svg>
  );
}
