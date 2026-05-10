import { supabase } from '../lib/supabase';

export interface DriverDocument {
  user_id: string;
  company_id: string | null;
  document_type: 'HGV_Licence' | 'CPC_Card' | 'Tacho_Card';
  storage_path: string;
  id_number: string;
  expiry_date: string;
  verified_at: string | null;
}

const uploadDocumentFile = async (
  uri: string,
  companyId: string | null,
  userId: string,
  documentType: string
) => {
  const fileExt = uri.split('.').pop();
  const timestamp = Date.now();
  const fileName = `${documentType}_${timestamp}.${fileExt}`;
  const folder = companyId || 'solo';
  const filePath = `${folder}/${userId}/${documentType}_${timestamp}`;

  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
  } as any);

  const { data, error } = await supabase.storage
    .from('driver-documents')
    .upload(filePath, formData);

  if (error) throw error;
  return filePath;
};

const addDocumentMetadata = async (doc: DriverDocument) => {
  const { data, error } = await supabase
    .from('driver_documents')
    .insert([doc])
    .select();

  if (error) {
    console.error('Error adding driver document metadata:', error);
    throw new Error(error.message);
  }

  return data;
};

export const driverDocumentService = {
  uploadDocumentFile,
  addDocumentMetadata,
};
