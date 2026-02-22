// Types for the Gesellschafter Onboarding Wizard

export interface PersonalData {
  salutation: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  taxId: string;
}

export interface ParticipationData {
  fundId: string;
  fundName: string;
  capitalContribution: string;
  entryDate: string;
  shareholderNumber: string;
}

export interface PortalAccessData {
  createPortalAccess: boolean;
  username: string;
  sendWelcomeEmail: boolean;
}

export interface DocumentFile {
  file: File;
  label: string;
  category: string;
}

export interface DocumentsData {
  files: DocumentFile[];
}

export interface OnboardingFormData {
  personalData: PersonalData;
  participation: ParticipationData;
  portalAccess: PortalAccessData;
  documents: DocumentsData;
}

export interface Fund {
  id: string;
  name: string;
  legalForm: string | null;
  totalCapital: number | null;
}

export interface OnboardingResult {
  personId: string;
  shareholderId: string;
  portalAccessCreated: boolean;
  temporaryPassword?: string;
  emailSent?: boolean;
  documentsUploaded: number;
}

export const WIZARD_STEPS = [
  { id: "personal-data", title: "Stammdaten", description: "Personendaten" },
  { id: "participation", title: "Beteiligung", description: "Fondsanteil" },
  { id: "portal-access", title: "Portal-Zugang", description: "Benutzerkonto" },
  { id: "documents", title: "Dokumente", description: "Unterlagen" },
  { id: "review", title: "Zusammenfassung", description: "Freigabe" },
] as const;

export function getInitialFormData(): OnboardingFormData {
  return {
    personalData: {
      salutation: "",
      firstName: "",
      lastName: "",
      birthDate: "",
      street: "",
      houseNumber: "",
      postalCode: "",
      city: "",
      phone: "",
      email: "",
      taxId: "",
    },
    participation: {
      fundId: "",
      fundName: "",
      capitalContribution: "",
      entryDate: new Date().toISOString().split("T")[0],
      shareholderNumber: "",
    },
    portalAccess: {
      createPortalAccess: false,
      username: "",
      sendWelcomeEmail: true,
    },
    documents: {
      files: [],
    },
  };
}
