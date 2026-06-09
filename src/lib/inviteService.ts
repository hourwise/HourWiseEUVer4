import { supabase } from './supabase';

export type InviteVerificationResult =
  | { ok: true; invite: any }
  | {
      ok: false;
      reason: 'empty' | 'missing' | 'expired' | 'already_used' | 'not_pending' | 'error';
      title?: string;
      message: string;
      guidance?: string;
      expiresAt?: string;
      status?: string;
    };

const buildInviteCodeCandidates = (inviteCode: string) => {
  const trimmedCode = inviteCode.trim();
  const collapsedCode = trimmedCode.replace(/[\s-]+/g, '');

  return Array.from(
    new Set([
      trimmedCode,
      trimmedCode.toUpperCase(),
      trimmedCode.toLowerCase(),
      collapsedCode,
      collapsedCode.toUpperCase(),
      collapsedCode.toLowerCase(),
    ]),
  ).filter(Boolean);
};

/**
 * Verifies a driver invite code and fetches the pre-filled data.
 * @param inviteCode The 8-character code entered by the driver.
 * @returns A structured verification result with diagnostics for the UI.
 */
export const verifyInviteCode = async (inviteCode: string) => {
  const inviteCodeCandidates = buildInviteCodeCandidates(inviteCode);
  if (inviteCodeCandidates.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      title: 'Invite code required',
      message: 'Invite code is empty.',
      guidance: 'Enter the code exactly as it appears in the invite email or portal.',
    } satisfies InviteVerificationResult;
  }

  try {
    let data: any = null;

    for (const codeCandidate of inviteCodeCandidates) {
      const { data: invite, error } = await supabase
        .from('driver_invites')
        .select('*')
        .ilike('invite_code', codeCandidate)
        .maybeSingle();

      if (error) {
        console.warn('Error verifying invite code:', error.message, {
          attemptedCode: codeCandidate,
        });
        return {
          ok: false,
          reason: 'error',
          title: 'Invite lookup failed',
          message: `Invite lookup failed: ${error.message}`,
          guidance: 'Try again in a moment. If this keeps happening, confirm the app build matches the invite environment.',
        } satisfies InviteVerificationResult;
      }

      if (invite) {
        data = invite;
        break;
      }
    }

    if (!data) {
      return {
        ok: false,
        reason: 'missing',
        title: 'Invite not found',
        message: 'Invite code was not found in this environment.',
        guidance: 'Check the code for typos and confirm the invite was created in the same test or live environment as this app build.',
      } satisfies InviteVerificationResult;
    }

    const expiresAt = new Date(data.expires_at);
    const now = new Date();

    if (Number.isNaN(expiresAt.getTime())) {
      console.warn('Invite code has invalid expires_at value:', data.expires_at);
      return {
        ok: false,
        reason: 'error',
        title: 'Invite data invalid',
        message: 'Invite expiry could not be read.',
        guidance: 'The invite record is malformed. Ask the fleet admin to generate a new invite.',
        expiresAt: data.expires_at,
        status: data.status,
      } satisfies InviteVerificationResult;
    }

    if (data.status === 'accepted') {
      return {
        ok: false,
        reason: 'already_used',
        title: 'Invite already used',
        message: 'This invite has already been accepted.',
        guidance: 'Ask the fleet admin to create a new invite if this driver still needs access.',
        expiresAt: data.expires_at,
        status: data.status,
      } satisfies InviteVerificationResult;
    }

    if (data.status !== 'pending') {
      return {
        ok: false,
        reason: 'not_pending',
        title: 'Invite not active',
        message: `Invite is ${data.status}, not pending.`,
        guidance: 'Ask the fleet admin to check the invite status or send a replacement invite.',
        expiresAt: data.expires_at,
        status: data.status,
      } satisfies InviteVerificationResult;
    }

    if (expiresAt.getTime() < now.getTime()) {
      return {
        ok: false,
        reason: 'expired',
        title: 'Invite expired',
        message: 'Invite code has expired.',
        guidance: 'Ask the fleet admin to send a new invite.',
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
      title: 'Invite verification error',
      message: 'Unexpected invite verification error.',
      guidance: 'Try again and, if the problem persists, confirm the invite exists in the same environment as this app build.',
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
