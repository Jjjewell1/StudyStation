// StudyStation brand logo (shield + open book + location pin).
export default function Logo({ className = 'h-10 w-10' }) {
  return (
    <svg
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="StudyStation logo"
      className={className}
    >
      <title>StudyStation logo</title>
      <path
        d="M120 16 L204 46 V120 C204 172 168 206 120 224 C72 206 36 172 36 120 V46 Z"
        fill="#3730a3"
        stroke="#312e81"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M120 96 C104 84 82 82 66 86 V150 C82 146 104 148 120 160 Z" fill="#ffffff" />
      <path d="M120 96 C136 84 158 82 174 86 V150 C158 146 136 148 120 160 Z" fill="#e5e7eb" />
      <rect x="117" y="94" width="6" height="66" rx="3" fill="#312e81" />
      <g stroke="#c7cad1" strokeWidth="4" strokeLinecap="round">
        <line x1="80" y1="104" x2="108" y2="108" />
        <line x1="80" y1="118" x2="108" y2="122" />
        <line x1="132" y1="108" x2="160" y2="104" />
        <line x1="132" y1="122" x2="160" y2="118" />
      </g>
      <path
        d="M120 40 C104 40 91 53 91 69 C91 88 120 112 120 112 C120 112 149 88 149 69 C149 53 136 40 120 40 Z"
        fill="#f59e0b"
        stroke="#b45309"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="120" cy="69" r="11" fill="#ffffff" />
    </svg>
  )
}
