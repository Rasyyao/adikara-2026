/** Preview of NusaCodeAI's live classroom: AI algorithm flowchart, collaborative board, and block/JS coding challenge. */
export function IntroIllustration() {
  return (
    <svg
      viewBox="0 0 420 296"
      role="img"
      aria-label="Pratinjau NusaCodeAI menampilkan papan tulis algoritma interaktif, blok kode JavaScript, dan sesi kelas langsung"
      className="h-auto w-full"
    >
      {/* Outer card */}
      <rect x="1" y="1" width="418" height="294" rx="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />

      {/* Top toolbar */}
      <rect x="2" y="2" width="416" height="42" rx="14" fill="var(--bg)" />
      <line x1="2" y1="44" x2="418" y2="44" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="22" cy="23" r="4.5" fill="var(--success)" />
      <text x="34" y="27" fontSize="11.5" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-sans)">
        SESI LIVE · ALGORITMA &amp; PEMROGRAMAN
      </text>
      <rect x="322" y="12" width="82" height="22" rx="11" fill="var(--primary-tint)" />
      <text x="363" y="27" fontSize="11" fontWeight="600" textAnchor="middle" fill="var(--primary)" fontFamily="var(--font-sans)">
        ✦ AI Visual
      </text>

      {/* Left panel: Interactive Flowchart on the Whiteboard */}
      <rect x="18" y="58" width="188" height="174" rx="12" fill="var(--bg)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="30" y="78" fontSize="10.5" fontWeight="600" fill="var(--muted)" fontFamily="var(--font-sans)">
        PAPAN TULIS KOLABORATIF
      </text>

      {/* Start node */}
      <rect x="72" y="88" width="80" height="26" rx="13" fill="var(--surface)" stroke="var(--primary)" strokeWidth="1.75" />
      <text x="112" y="105" fontSize="11" fontWeight="600" textAnchor="middle" fill="var(--primary)" fontFamily="var(--font-mono)">
        mulai(n)
      </text>
      <line x1="112" y1="114" x2="112" y2="128" stroke="var(--primary)" strokeWidth="1.75" />

      {/* Decision diamond */}
      <polygon
        points="112,128 164,152 112,176 60,152"
        fill="var(--primary-tint)"
        stroke="var(--primary)"
        strokeWidth="1.75"
      />
      <text x="112" y="156" fontSize="10.5" fontWeight="600" textAnchor="middle" fill="var(--primary)" fontFamily="var(--font-mono)">
        n % 2 == 0
      </text>

      {/* Branches */}
      <path d="M60 152 H44 V190" fill="none" stroke="var(--success)" strokeWidth="1.75" />
      <path d="M164 152 H180 V190" fill="none" stroke="var(--muted)" strokeWidth="1.75" />

      <rect x="26" y="190" width="56" height="26" rx="7" fill="var(--surface)" stroke="var(--success)" strokeWidth="1.75" />
      <text x="54" y="207" fontSize="10.5" fontWeight="600" textAnchor="middle" fill="var(--success)" fontFamily="var(--font-mono)">
        &quot;Genap&quot;
      </text>

      <rect x="142" y="190" width="54" height="26" rx="7" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="169" y="207" fontSize="10.5" fontWeight="500" textAnchor="middle" fill="var(--muted)" fontFamily="var(--font-mono)">
        &quot;Ganjil&quot;
      </text>

      {/* Live cursor badge */}
      <path d="M148 106 l10 4 l-4 3 l-2 5 z" fill="var(--primary)" />
      <rect x="156" y="96" width="42" height="16" rx="5" fill="var(--primary)" />
      <text x="177" y="107" fontSize="9.5" fontWeight="600" textAnchor="middle" fill="#ffffff" fontFamily="var(--font-sans)">
        Guru
      </text>

      {/* Right panel: Block Puzzle & JS Code Challenge */}
      <rect x="218" y="58" width="184" height="174" rx="12" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="230" y="78" fontSize="10.5" fontWeight="600" fill="var(--muted)" fontFamily="var(--font-sans)">
        SOAL BLOK &amp; JAVASCRIPT
      </text>

      {/* Block 1 */}
      <rect x="230" y="90" width="160" height="26" rx="6" fill="var(--primary-tint)" stroke="var(--primary)" strokeWidth="1.5" />
      <text x="240" y="107" fontSize="10.5" fontWeight="600" fill="var(--primary)" fontFamily="var(--font-mono)">
        function cekBilangan(n)
      </text>

      {/* Block 2 (indented) */}
      <rect x="242" y="122" width="148" height="26" rx="6" fill="var(--bg)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="252" y="139" fontSize="10.5" fontWeight="500" fill="var(--ink)" fontFamily="var(--font-mono)">
        if (n % 2 === 0)
      </text>

      {/* Block 3 (double indented) */}
      <rect x="254" y="154" width="136" height="26" rx="6" fill="var(--bg)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="264" y="171" fontSize="10.5" fontWeight="500" fill="var(--ink)" fontFamily="var(--font-mono)">
        return &quot;Genap&quot;;
      </text>

      {/* Test result pill */}
      <rect x="230" y="192" width="160" height="28" rx="8" fill="var(--bg)" stroke="var(--success)" strokeWidth="1.5" />
      <path d="M242 206 l4 4 l8 -8" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="258" y="210" fontSize="11" fontWeight="600" fill="var(--success)" fontFamily="var(--font-sans)">
        4/4 Kasus Uji Lulus
      </text>

      {/* Bottom status bar: Features & Active Class */}
      <rect x="18" y="244" width="384" height="36" rx="10" fill="var(--bg)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="32" y="266" fontSize="11.5" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-sans)">
        Materi AI · Mindmap · Papan Live · Kuis &amp; Analisis Siswa
      </text>
      <rect x="336" y="252" width="56" height="20" rx="6" fill="var(--primary-tint)" />
      <text x="364" y="266" fontSize="10.5" fontWeight="600" textAnchor="middle" fill="var(--primary)" fontFamily="var(--font-mono)">
        LIVE
      </text>
    </svg>
  );
}
