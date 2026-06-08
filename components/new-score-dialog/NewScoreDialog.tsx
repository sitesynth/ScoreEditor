'use client';

import { useState } from 'react';
import type { Instrument, TimeSig } from '@/lib/music-model';
import { createEmptyScore, type ScoreConfig, type Score } from '@/lib/music-model';
import StepInstruments from './StepInstruments';
import StepDetails from './StepDetails';
import StepSignatures from './StepSignatures';

const STEPS = ['Instruments', 'Details', 'Key & Time'];

interface Props {
  onCreated: (score: Score) => void;
}

export default function NewScoreDialog({ onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [tempo, setTempo] = useState(120);
  const [numMeasures, setNumMeasures] = useState(8);
  const [keySig, setKeySig] = useState(0);
  const [timeSig, setTimeSig] = useState<TimeSig>({ num: 4, den: 4 });

  function handleDetailChange(field: 'title' | 'composer' | 'tempo' | 'numMeasures', value: string | number) {
    if (field === 'title') setTitle(value as string);
    else if (field === 'composer') setComposer(value as string);
    else if (field === 'tempo') setTempo(value as number);
    else if (field === 'numMeasures') setNumMeasures(value as number);
  }

  function canNext(): boolean {
    if (step === 0) return instruments.length > 0;
    return true;
  }

  function create() {
    const parts: ScoreConfig['parts'] = [];
    for (const inst of instruments) {
      parts.push({ instrument: inst, clef: inst.defaultClef });
      if (inst.secondaryClef) {
        parts.push({ instrument: inst, clef: inst.secondaryClef });
      }
    }

    const config: ScoreConfig = {
      title: title || 'Untitled Score',
      composer,
      tempo,
      timeSig,
      keySig,
      numMeasures,
      parts,
    };

    onCreated(createEmptyScore(config));
  }

  return (
    // Backdrop
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Card */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        width: '100%',
        maxWidth: 680,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 0',
          background: '#1a1a2e',
          color: '#fff',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>New Score</h2>

          {/* Step tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => i < step && setStep(i)}
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: i === step ? 700 : 400,
                  cursor: i < step ? 'pointer' : 'default',
                  background: 'none',
                  border: 'none',
                  color: i === step ? '#fff' : 'rgba(255,255,255,0.5)',
                  borderBottom: i === step ? '2px solid #c0392b' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                {i + 1}. {s}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
          {step === 0 && (
            <StepInstruments selected={instruments} onChange={setInstruments} />
          )}
          {step === 1 && (
            <StepDetails
              title={title}
              composer={composer}
              tempo={tempo}
              numMeasures={numMeasures}
              onChange={handleDetailChange}
            />
          )}
          {step === 2 && (
            <StepSignatures
              keySig={keySig}
              timeSig={timeSig}
              onChangeKey={setKeySig}
              onChangeTime={setTimeSig}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#faf9f7',
        }}>
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            style={{
              padding: '9px 20px',
              borderRadius: 7,
              border: '1px solid #ccc',
              fontSize: 14,
              cursor: step === 0 ? 'default' : 'pointer',
              opacity: step === 0 ? 0.4 : 1,
              background: '#fff',
            }}
          >
            Back
          </button>

          <div style={{ display: 'flex', gap: 4 }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: i <= step ? '#1a1a2e' : '#ddd',
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              style={{
                padding: '9px 24px',
                borderRadius: 7,
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                cursor: canNext() ? 'pointer' : 'default',
                opacity: canNext() ? 1 : 0.4,
                background: '#1a1a2e',
                color: '#fff',
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={create}
              style={{
                padding: '9px 24px',
                borderRadius: 7,
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                background: '#c0392b',
                color: '#fff',
              }}
            >
              Create Score
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
