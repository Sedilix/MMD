"use client"

import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, setDoc, doc, serverTimestamp, orderBy, FieldValue, Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export interface Member {
  id: string;
  uid: string;
  name: string;
  role: string;
  bio: string;
  skills: string[];
  avatarUrl?: string;
  joinedAt: FieldValue | Timestamp;
  completedProjects?: number;
  isOnline?: boolean;
}

export function useRoster() {
  const firestore = useFirestore();
  const { user } = useUser();

  const membersQuery = useMemo(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'members'),
      orderBy('joinedAt', 'desc')
    );
  }, [firestore]);

  const { data: members, loading } = useCollection<Member>(membersQuery);

  const joinRoster = (name: string, role: string, bio: string, skills: string[], avatarUrl?: string) => {
    if (!user || !firestore) return;
    
    const currentMember = members?.find(m => m.uid === user.uid);
    const completedProjects = currentMember?.completedProjects ?? 0;

    const memberDoc = doc(firestore, 'members', user.uid);
    const data = {
      uid: user.uid,
      name,
      role,
      bio,
      skills,
      avatarUrl: avatarUrl || `https://picsum.photos/seed/${user.uid}/200`,
      joinedAt: serverTimestamp(),
      completedProjects,
      isOnline: true
    };

    setDoc(memberDoc, data)
      .catch(async (_serverError) => {
        const permissionError = new FirestorePermissionError({
          path: memberDoc.path,
          operation: 'create',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  return { members, loading, joinRoster, user };
}
