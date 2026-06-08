// Minimal MusicXML for a blank score with one instrument.
// Used as the seed document for the v2 editor.
// Verovio renders this into a proper engraved SVG.

export const EMPTY_SCORE_MUSICXML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>New Project</work-title>
  </work>
  <identification>
    <encoding>
      <software>ScoreEditor</software>
      <supports element="accidental" type="yes"/>
      <supports element="beam" type="yes"/>
      <supports element="stem" type="yes"/>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <part-abbreviation>Pno.</part-abbreviation>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <note>
        <rest measure="yes"/>
        <duration>16</duration>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest measure="yes"/>
        <duration>16</duration>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <rest measure="yes"/>
        <duration>16</duration>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <rest measure="yes"/>
        <duration>16</duration>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;
