/** One consultation note, as returned inside get_patient_record. */
export interface Visit {
  id: string;
  visit_date: string;
  doctor_id: string;
  doctor_name: string;
  appointment_id: string | null;
  complaints: string | null;
  examination_notes: string | null;
  diagnosis: string | null;
  plan: string | null;
  follow_up_date: string | null;
  updated_at: string;
  /** How many times the note has been edited */
  edits: number;
}

export interface ClinicalProfile {
  allergies: string | null;
  conditions: string | null;
  current_medications: string | null;
  notes: string | null;
  updated_at?: string;
}

export interface PatientRecord {
  patient: {
    id: string;
    full_name: string;
    phone: string | null;
    is_active: boolean;
    date_of_birth: string | null;
    gender: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  };
  profile: ClinicalProfile | null;
  /** The signed-in doctor's own listing id: notes with this doctor_id are theirs to edit */
  my_doctor_id: string;
  visits: Visit[];
}

/** Whole years between a date of birth and today. */
export function ageFrom(dateOfBirth: string | null, today: string): number | null {
  if (!dateOfBirth) return null;
  const [by, bm, bd] = dateOfBirth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export const GENDER_LABEL: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Prefers not to say',
};
