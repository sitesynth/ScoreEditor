'use client';

interface Props {
  title: string;
  composer: string;
  tempo: number;
  numMeasures: number;
  onChange: (field: 'title' | 'composer' | 'tempo' | 'numMeasures', value: string | number) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 6,
  background: '#faf9f7',
  color: '#1a1a1a',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#555',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          style={{
            width: 32, height: 32, borderRadius: 6, border: '1px solid #ccc',
            background: '#f0ede8', fontSize: 18, lineHeight: 1, cursor: 'pointer',
          }}
        >−</button>
        <span style={{ minWidth: 40, textAlign: 'center', fontSize: 15, fontWeight: 600 }}>{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          style={{
            width: 32, height: 32, borderRadius: 6, border: '1px solid #ccc',
            background: '#f0ede8', fontSize: 18, lineHeight: 1, cursor: 'pointer',
          }}
        >+</button>
      </div>
    </div>
  );
}

export default function StepDetails({ title, composer, tempo, numMeasures, onChange }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <label style={labelStyle}>Title</label>
        <input
          style={inputStyle}
          value={title}
          placeholder="Untitled Score"
          onChange={e => onChange('title', e.target.value)}
        />
      </div>
      <div>
        <label style={labelStyle}>Composer</label>
        <input
          style={inputStyle}
          value={composer}
          placeholder="Composer name (optional)"
          onChange={e => onChange('composer', e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 32 }}>
        <Stepper
          label="Tempo (BPM)"
          value={tempo}
          min={20}
          max={300}
          onChange={v => onChange('tempo', v)}
        />
        <Stepper
          label="Starting Measures"
          value={numMeasures}
          min={1}
          max={64}
          onChange={v => onChange('numMeasures', v)}
        />
      </div>
    </div>
  );
}
