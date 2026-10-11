import { useCallback, useEffect, useRef, useState } from 'react';
import { listAppointments, type Appointment } from './appointments';
import { friendlyError } from './auth';

/** Loads appointments for a range of clinic days and reloads them on request. */
export function useAppointments(from: string, to: string, doctorId?: string) {
  const [rows, setRows] = useState<Appointment[] | null>(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++request.current;
    try {
      const data = await listAppointments(from, to, doctorId);
      if (mine !== request.current) return;
      setRows(data);
      setError('');
    } catch (e) {
      if (mine !== request.current) return;
      setRows([]);
      setError(friendlyError(e));
    }
  }, [from, to, doctorId]);

  useEffect(() => {
    setRows(null);
    void reload();
  }, [reload]);

  return { rows, error, reload };
}
