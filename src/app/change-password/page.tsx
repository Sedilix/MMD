"use client"

import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { useAuth, useUser } from '@/firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

import Image from 'next/image';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const { user, loading: authLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  // Check if the user is authenticated via Email/Password
  const isPasswordUser = user?.providerData?.some(
    (provider) => provider.providerId === 'password'
  ) ?? true;

  useEffect(() => {
    if (authLoading) return;

    const checkStatus = async () => {
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const db = getFirestore();
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists() && userDoc.data().requiresPasswordChange) {
          setChecking(false);
        } else {
          // If they don't require a password change, send to dashboard
          router.push('/dashboard');
        }
      } catch (err) {
        console.error("Failed to check user status", err);
        setChecking(false); // Let them try anyway or show error
      }
    };

    checkStatus();
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth?.currentUser || !user) return;
    
    if (isPasswordUser && !currentPassword) {
      setError("Please enter your current temporary access code / password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError("Password must contain at least one lowercase letter.");
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (!/[^a-zA-Z0-9]/.test(newPassword)) {
      setError("Password must contain at least one special symbol.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Re-authenticate if it is a password user
      if (isPasswordUser) {
        const credential = EmailAuthProvider.credential(user.email!, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }

      // 2. Update Password in Firebase Auth
      await updatePassword(auth.currentUser, newPassword);

      // 3. Remove requiresPasswordChange flag
      const db = getFirestore();
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        requiresPasswordChange: false,
        passwordChangedAt: new Date().toISOString()
      });

      // Clear sensitive state
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // 4. Redirect
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      let friendlyError = err.message || 'An unexpected error occurred.';
      if (err.code === 'auth/wrong-password') {
        friendlyError = 'The current password you entered is incorrect. Please check your credentials and try again.';
      } else if (err.code === 'auth/invalid-credential') {
        friendlyError = 'Invalid credentials. Please verify your current password.';
      } else if (err.code === 'auth/weak-password') {
        friendlyError = 'The new password is too weak. Please use a stronger password.';
      } else if (err.code === 'auth/requires-recent-login') {
        friendlyError = 'For security reasons, please re-enter your current password to verify your session.';
      } else if (err.code === 'auth/user-token-expired') {
        friendlyError = 'Your session has expired. Please log out and sign in again.';
      }
      setError(friendlyError);
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-transparent">
        <Icon name="loading" className="h-8 w-8 animate-spin text-[#c68f3d]" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-transparent relative font-sans">
      <Card className="w-full max-w-md glass-morphism border-primary/20 cybr-glow">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image 
              src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
                alt="Cybrdeck Logo"
                width={400}
                height={80}
                className="h-8 md:h-10 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.3)]"
                priority 
            />
          </div>
          <CardTitle className="text-2xl font-headline font-bold tracking-tighter uppercase">Security Update Required</CardTitle>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            Replace temporary access code with permanent credentials.
          </p>
        </CardHeader>
        
        <CardContent className="pt-6 space-y-4">
          {error && (
            <div className="p-3 mb-6 bg-red-500/10 border border-red-500/30 rounded flex items-center gap-3 text-red-400 font-mono text-xs">
              <Icon name="shield-warning" className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isPasswordUser && (
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest ml-1">Current Temporary Code</label>
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-background/50 border-white/10 text-white h-12"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest ml-1">New Permanent Code</label>
              <Input 
                type="password" 
                placeholder="••••••••" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-background/50 border-white/10 text-white h-12"
                required
              />
              <p className="text-[10px] text-muted-foreground mt-1 ml-1 leading-tight uppercase tracking-wider font-mono">
                Must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest ml-1">Verify Code</label>
              <Input 
                type="password" 
                placeholder="••••••••" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-background/50 border-white/10 text-white h-12"
                required
              />
            </div>
            
            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full h-12 bg-primary hover:bg-primary/80 text-white font-headline text-xs tracking-widest" 
                disabled={loading}
              >
                {loading ? <Icon name="loading" className="h-4 w-4 animate-spin mr-2" /> : null}
                {loading ? 'SECURING...' : 'UPDATE & ACCESS MATRIX'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
