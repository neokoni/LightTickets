export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface CreateLabelPayload {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface UpdateLabelPayload {
  name?: string;
  color?: string;
  description?: string;
}
