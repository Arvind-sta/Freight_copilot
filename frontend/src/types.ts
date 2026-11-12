export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  company: number | null;
  company_name: string | null;
}

export interface DocumentRecord {
  id: number;
  name: string;
  document_type: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  file: string;
  uploaded_at: string;
}

export interface SourcePassage {
  document_name: string;
  page_number: number;
  chunk_index: number;
  text: string;
}

export interface AnswerResult {
  answer: string;
  sources: SourcePassage[];
}

export interface ClaimDraft {
  id: number;
  shipment_id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
}