import { supabase } from './supabase';

/**
 * Verifies a driver invite code and fetches the pre-filled data.
 * @param inviteCode The 8-character code entered by the driver.
 * @returns The invitation data if the code is valid and pending, otherwise null.
 */
export const verifyInviteCode = async (inviteCode: string) => {
  const formattedCode = inviteCode.trim().toUpperCase();
  if (!formattedCode) {
    console.error("Invite code is empty.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('driver_invites')
      .select('*')
      .eq('invite_code', formattedCode)
      .eq('status', 'pending')
      .single();

    if (error) {
      console.log("Error verifying invite code:", error.message);
      return null;
    }

    if (data && new Date(data.expires_at) < new Date()) {
      console.error("Invite code has expired.");
      await supabase.from('driver_invites').update({ status: 'expired' }).eq('id', data.id);
      return null;
    }

    return data;
  } catch (error) {
    console.error("An unexpected error occurred during invite verification:", error);
    return null;
  }
};

/**
 * Marks a driver invite as accepted after successful registration.
 * @param inviteId The ID of the invite to update.
 * @param userId The ID of the user who accepted the invite.
 */
export const acceptInvite = async (inviteId: string, userId: string) => {
  try {
    const { error } = await supabase
      .from('driver_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: userId,
      })
      .eq('id', inviteId);

    if (error) {
      console.error("Failed to update invite status:", error.message);
      // This is not a critical failure for the user, so we just log it.
    }
  } catch (error) {
    console.error("An unexpected error occurred while accepting invite:", error);
  }
};
