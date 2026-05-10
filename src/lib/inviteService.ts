import { supabase } from './supabase';

export type InviteVerificationResult =
  | { ok: true; invite: any }
  | {
      ok: false;
      reason: 'missing' | 'expired' | 'not_pending' | 'error';
      message: string;
      expiresAt?: string;
      status?: string;
    };

/**
 * Verifies a driver invite code and fetches the pre-filled data.
 * @param inviteCode The 8-character code entered by the driver.
 * @returns A structured verification result with diagnostics for the UI.
 */
export const verifyInviteCode = async (inviteCode: string) => {
  const formattedCode = inviteCode.trim().toUpperCase();
  if (!formattedCode) {
    return {
      ok: false,
      reason: 'missing',
      message: 'Invite code is empty.',
    } satisfies InviteVerificationResult;
  }

  try {
    const { data, error } = await supabase
      .from('driver_invites')
      .select('*')
      .eq('invite_code', formattedCode)
      .single();

    if (error) {
      console.warn('Error verifying invite code:', error.message);
      return {
        ok: false,
        reason: 'missing',
        message: 'Invite code was not found.',
      } satisfies InviteVerificationResult;
    }

    if (!data) {
      return {
        ok: false,
        reason: 'missing',
        message: 'Invite code was not found.',
      } satisfies InviteVerificationResult;
    }

    const expiresAt = new Date(data.expires_at);
    const now = new Date();

    if (Number.isNaN(expiresAt.getTime())) {
      console.warn('Invite code has invalid expires_at value:', data.expires_at);
      return {
        ok: false,
        reason: 'error',
        message: 'Invite expiry could not be read.',
        expiresAt: data.expires_at,
        status: data.status,
      } satisfies InviteVerificationResult;
    }

    if (data.status !== 'pending') {
      return {
        ok: false,
        reason: 'not_pending',
        message: `Invite is ${data.status}, not pending.`,
        expiresAt: data.expires_at,
        status: data.status,
      } satisfies InviteVerificationResult;
    }

    if (expiresAt.getTime() < now.getTime()) {
      return {
        ok: false,
        reason: 'expired',
        message: 'Invite code has expired.',
        expiresAt: data.expires_at,
        status: data.status,
      } satisfies InviteVerificationResult;
    }

    return { ok: true, invite: data } satisfies InviteVerificationResult;
  } catch (error) {
    console.error('An unexpected error occurred during invite verification:', error);
    return {
      ok: false,
      reason: 'error',
      message: 'Unexpected invite verification error.',
    } satisfies InviteVerificationResult;
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
