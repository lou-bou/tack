// TEMPORARY: see lib/trace.ts.
import { useState } from 'react';
import {
  TRACE_SWITCHES,
  clearTrace,
  disableTrace,
  setTraceSwitch,
  traceReport,
  traceSwitches,
  type TraceSwitch,
} from '../lib/trace';
import { Button } from './Button';
import { useToast } from './Toast';
import fieldStyles from './Field.module.css';
import pageStyles from '../pages/Settings.module.css';

export function DiagnosticsSection() {
  const toast = useToast();
  const [on, setOn] = useState<ReadonlySet<TraceSwitch>>(traceSwitches);
  const [shown, setShown] = useState<string | null>(null);

  const toggle = (name: TraceSwitch, value: boolean) => {
    setTraceSwitch(name, value);
    setOn(traceSwitches());
  };

  const copy = async () => {
    const report = traceReport();
    try {
      await navigator.clipboard.writeText(report);
      toast.show('Report copied');
    } catch {
      // Shown instead, to select by hand.
      setShown(report);
    }
  };

  return (
    <section className={pageStyles.section} aria-labelledby="diagnostics">
      <h2 id="diagnostics" className={pageStyles.heading}>
        Diagnostics
      </h2>
      <p>Recording. Switches apply to the next card you open.</p>
      {(Object.keys(TRACE_SWITCHES) as TraceSwitch[]).map((name) => (
        <label key={name} className={pageStyles.row}>
          <span>{TRACE_SWITCHES[name]}</span>
          <input
            type="checkbox"
            checked={on.has(name)}
            onChange={(event) => toggle(name, event.target.checked)}
          />
        </label>
      ))}
      <div className={pageStyles.row}>
        <Button variant="primary" onClick={() => void copy()}>
          Copy report
        </Button>
        <Button
          onClick={() => {
            clearTrace();
            setShown(null);
            toast.show('Report cleared');
          }}
        >
          Clear
        </Button>
        <Button variant="danger" onClick={disableTrace}>
          Turn off
        </Button>
      </div>
      {shown !== null && (
        <textarea
          className={fieldStyles.input}
          aria-label="Report"
          rows={8}
          readOnly
          value={shown}
        />
      )}
    </section>
  );
}
