'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Score, Pitch } from '@/lib/music-model';
import { useScore } from '@/lib/score-reducer';
import { useEditorState, DURATION_KEY_MAP } from '@/lib/editor-state';
import { letterToPitch } from '@/lib/music-model';
import { saveScore, loadScore } from '@/lib/storage';
import { exportMusicXml, importMusicXml } from '@/lib/musicxml';

import NewScoreDialog   from '@/components/new-score-dialog/NewScoreDialog';
import OsmdRenderer     from '@/components/score-renderer/OsmdRenderer';
import EditorHeader     from '@/components/editor/EditorHeader';
import NoteToolbar      from '@/components/editor/NoteToolbar';
import LeftSidebar      from '@/components/editor/LeftSidebar';
import PianoKeyboard    from '@/components/editor/PianoKeyboard';

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function EditorPage() {
  const [scoreReady,    setScoreReady]    = useState(false);
  const [showDialog,    setShowDialog]    = useState(false);
  const [zoom,          setZoom]          = useState(100);
  const [initialScore,  setInitialScore]  = useState<Score | null>(null);

  // rawXml: when user opens an external .xml/.mxl file we store the XML here
  // and pass it directly to OSMD (no lossy round-trip through our model)
  const [rawXml, setRawXml] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadScore();
    if (saved) { setInitialScore(saved); setScoreReady(true); }
    else        { setShowDialog(true); }
  }, []);

  if (!scoreReady && !showDialog) return null;

  if (!scoreReady) {
    return (
      <NewScoreDialog
        onCreated={(score) => {
          saveScore(score);
          setInitialScore(score);
          setScoreReady(true);
          setShowDialog(false);
          setRawXml(null);
        }}
      />
    );
  }

  return (
    <EditorWithScore
      key={initialScore!.id}
      initialScore={initialScore!}
      zoom={zoom}
      rawXml={rawXml}
      onZoomChange={setZoom}
      onRawXml={setRawXml}
      onNewScore={() => {
        setScoreReady(false);
        setShowDialog(true);
        setInitialScore(null);
        setRawXml(null);
      }}
    />
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

interface EditorProps {
  initialScore: Score;
  zoom:         number;
  rawXml:       string | null;
  onZoomChange: (z: number) => void;
  onRawXml:     (xml: string | null) => void;
  onNewScore:   () => void;
}

function EditorWithScore({
  initialScore, zoom, rawXml,
  onZoomChange, onRawXml, onNewScore,
}: EditorProps) {

  const {
    score, cursor, canUndo, canRedo,
    insertNote, insertRest, deleteNotes, moveCursor,
    undo, redo, setKeySig, setTimeSig, dispatch,
  } = useScore(initialScore);

  const {
    mode, selectedDuration, selectedNoteIds, pendingAlter,
    enterNoteInput, exitNoteInput, selectNote, clearSelection,
    selectDuration, setPendingAlter, toggleDot,
  } = useEditorState();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autosave
  useEffect(() => {
    if (rawXml) return; // don't overwrite when viewing external file
    const t = setTimeout(() => saveScore(score), 800);
    return () => clearTimeout(t);
  }, [score, rawXml]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'n' || e.key === 'N') {
        mode === 'note-input' ? exitNoteInput() : enterNoteInput(); return;
      }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
      if (mode !== 'note-input') return;

      if (DURATION_KEY_MAP[e.key]) { selectDuration(DURATION_KEY_MAP[e.key]); return; }
      if (e.key === '.') { toggleDot(); return; }
      if (e.key === '+') { setPendingAlter(1); return; }
      if (e.key === '-') { setPendingAlter(-1); return; }

      const letter = e.key.toLowerCase();
      if ('abcdefg'.includes(letter) && letter.length === 1) {
        const m = score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
        const prev = m?.notes[cursor.noteIndex - 1];
        const lastMidi = prev?.type === 'note' ? prev.pitch.midi : null;
        const pitch = letterToPitch(letter, lastMidi, pendingAlter);
        insertNote({ type: 'note', id: crypto.randomUUID(), pitch, duration: selectedDuration });
        setPendingAlter(0);
        return;
      }
      if (e.key === '0') {
        insertRest({ type: 'rest', id: crypto.randomUUID(), duration: selectedDuration }); return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNoteIds.size > 0) {
        deleteNotes(Array.from(selectedNoteIds)); clearSelection(); return;
      }
      if (e.key === 'Escape') { exitNoteInput(); clearSelection(); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, score, cursor, selectedDuration, selectedNoteIds, pendingAlter,
    insertNote, insertRest, deleteNotes, moveCursor, clearSelection,
    enterNoteInput, exitNoteInput, selectDuration, setPendingAlter, toggleDot, undo, redo]);

  // ── Piano key click ───────────────────────────────────────────────────────

  function handlePianoKey(midi: number, alter: -1 | 0 | 1) {
    if (mode !== 'note-input') { enterNoteInput(); return; }
    const pitch: Pitch = { midi, alter: pendingAlter !== 0 ? pendingAlter : alter };
    insertNote({ type: 'note', id: crypto.randomUUID(), pitch, duration: selectedDuration });
    setPendingAlter(0);
  }

  // ── Export MusicXML ───────────────────────────────────────────────────────

  function handleExportXml() {
    const xml  = rawXml ?? exportMusicXml(score);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${score.metadata.title || 'score'}.musicxml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import MusicXML (.xml or .mxl) ───────────────────────────────────────

  async function handleImportFile(file: File) {
    try {
      if (file.name.endsWith('.mxl')) {
        // .mxl = ZIP → unzip in browser, extract the main XML
        const JSZip = (await import('jszip')).default;
        const zip   = await JSZip.loadAsync(await file.arrayBuffer());

        // Find the main XML file (listed in META-INF/container.xml or largest .xml)
        let xmlContent: string | null = null;
        const containerFile = zip.file('META-INF/container.xml');
        if (containerFile) {
          const containerXml = await containerFile.async('text');
          const match = containerXml.match(/full-path="([^"]+\.xml)"/);
          if (match) {
            const mainFile = zip.file(match[1]);
            if (mainFile) xmlContent = await mainFile.async('text');
          }
        }
        if (!xmlContent) {
          // Fallback: find first .xml file that isn't container.xml
          for (const [name, f] of Object.entries(zip.files)) {
            if (name.endsWith('.xml') && !name.includes('META-INF')) {
              xmlContent = await (f as any).async('text');
              break;
            }
          }
        }
        if (!xmlContent) throw new Error('Could not find MusicXML inside .mxl file');
        onRawXml(xmlContent);
      } else {
        // Plain .xml / .musicxml
        const xml = await file.text();
        onRawXml(xml);
      }
    } catch (e: any) {
      alert('Failed to open file: ' + (e?.message ?? e));
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
    e.target.value = ''; // allow re-opening same file
  }

  // ── Tempo ─────────────────────────────────────────────────────────────────

  function handleSetTempo(bpm: number) {
    dispatch({ type: 'SET_TEMPO', tempo: bpm });
  }

  // ── Active MIDI for piano highlight ──────────────────────────────────────

  const activeMidi = (() => {
    if (selectedNoteIds.size !== 1) return undefined;
    const id = Array.from(selectedNoteIds)[0];
    for (const part of score.parts)
      for (const measure of part.measures) {
        const n = measure.notes.find(x => x.id === id && x.type === 'note');
        if (n && n.type === 'note') return n.pitch.midi;
      }
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#1b1d23' }}>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,.musicxml,.mxl"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {/* Header */}
      <EditorHeader
        title={score.metadata.title}
        composer={score.metadata.composer}
        canUndo={canUndo}
        canRedo={canRedo}
        zoom={zoom}
        onUndo={undo}
        onRedo={redo}
        onZoomChange={onZoomChange}
        onNewScore={onNewScore}
        onExportXml={handleExportXml}
        onImportXml={openFilePicker}
      />

      {/* Note toolbar */}
      <NoteToolbar
        mode={mode}
        selectedDuration={selectedDuration}
        pendingAlter={pendingAlter}
        onToggleNoteInput={() => mode === 'note-input' ? exitNoteInput() : enterNoteInput()}
        onSelectDuration={selectDuration}
        onToggleDot={toggleDot}
        onSetAlter={setPendingAlter}
        onInsertRest={() => insertRest({ type: 'rest', id: crypto.randomUUID(), duration: selectedDuration })}
      />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left sidebar */}
        <LeftSidebar
          score={score}
          cursorPartIndex={cursor.partIndex}
          onSetKeySig={setKeySig}
          onSetTimeSig={setTimeSig}
          onSetTempo={handleSetTempo}
        />

        {/* Score + piano */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* "Viewing external file" banner */}
          {rawXml && (
            <div style={{
              background: '#2c3e50', color: 'rgba(255,255,255,0.8)',
              fontSize: 12, padding: '6px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              flexShrink: 0,
            }}>
              <span>📄 Viewing imported file (read-only)</span>
              <button
                onClick={() => onRawXml(null)}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                }}
              >
                ✕ Close
              </button>
            </div>
          )}

          {/* Score area — OSMD renders here */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            background: '#e8e5df',
            padding: '24px',
          }}>
            <div style={{
              background: '#fff',
              borderRadius: 4,
              boxShadow: '0 2px 20px rgba(0,0,0,0.13)',
              padding: '32px 24px 40px',
              minHeight: 400,
            }}>
              {/* Title (drawn by us, not OSMD) */}
              {!rawXml && (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif' }}>
                    {score.metadata.title}
                  </div>
                  {score.metadata.composer && (
                    <div style={{ fontSize: 13, color: '#555', marginTop: 3 }}>
                      {score.metadata.composer}
                    </div>
                  )}
                </div>
              )}

              <OsmdRenderer
                score={score}
                rawXml={rawXml}
                zoom={zoom}
              />
            </div>
          </div>

          {/* Piano keyboard */}
          <PianoKeyboard
            mode={mode}
            activeMidi={activeMidi}
            onKeyClick={handlePianoKey}
          />
        </div>
      </div>
    </div>
  );
}
