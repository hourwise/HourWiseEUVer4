import { supabase } from '../lib/supabase';

export interface VehicleDocument {
  vehicle_id: string;
  company_id: string | null;
  document_type: string;
  storage_path: string;
  id_number?: string | null;
  expiry_date?: string | null;
  uploaded_by: string;
}

const uploadVehicleDocumentFile = async (
  uri: string,
  vehicleId: string,
  companyId: string | null,
  documentType: string
) => {
  const fileExt = uri.split('.').pop();
  const timestamp = Date.now();
  const folder = companyId || 'solo';
  const filePath = `${folder}/${vehicleId}/${documentType}_${timestamp}`;

  const formData = new FormData();
  formData.append('file', {
    uri: uri,
    name: `${documentType}_${timestamp}.${fileExt}`,
    type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
  } as any);

  const { error } = await supabase.storage
    .from('vehicle-documents')
    .upload(filePath, formData);

  if (error) throw error;
  return filePath;
};

const addVehicleDocumentMetadata = async (doc: VehicleDocument) => {
  const { data, error } = await supabase
    .from('vehicle_documents')
    .insert([doc])
    .select();

  if (error) {
    console.error('Error adding vehicle document metadata:', error);
    throw new Error(error.message);
  }

  return data;
};

export const vehicleDocumentService = {
  uploadVehicleDocumentFile,
  addVehicleDocumentMetadata,
};
