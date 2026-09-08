"use client"

import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where, orderBy, FieldValue, Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  categories: string[];
  labels: string[];
  userId: string;
  createdAt: FieldValue | Timestamp;
}

export function useTasks() {
  const firestore = useFirestore();
  const { user } = useUser();

  const tasksQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'tasks'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, user]);

  const { data: tasks, loading } = useCollection<Task>(tasksQuery);

  const addTask = (title: string, description: string = '', categories: string[] = [], labels: string[] = []) => {
    if (!user || !firestore) return;
    
    const tasksRef = collection(firestore, 'tasks');
    const data = {
      title,
      description,
      status: 'todo' as TaskStatus,
      categories,
      labels,
      userId: user.uid,
      createdAt: serverTimestamp()
    };

    addDoc(tasksRef, data)
      .catch(async (_serverError) => {
        const permissionError = new FirestorePermissionError({
          path: tasksRef.path,
          operation: 'create',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    if (!firestore) return;
    const taskRef = doc(firestore, 'tasks', id);
    
    updateDoc(taskRef, updates)
      .catch(async (_serverError) => {
        const permissionError = new FirestorePermissionError({
          path: taskRef.path,
          operation: 'update',
          requestResourceData: updates,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const deleteTask = (id: string) => {
    if (!firestore) return;
    const taskRef = doc(firestore, 'tasks', id);
    
    deleteDoc(taskRef)
      .catch(async (_serverError) => {
        const permissionError = new FirestorePermissionError({
          path: taskRef.path,
          operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const moveTask = (id: string, newStatus: TaskStatus) => {
    updateTask(id, { status: newStatus });
  };

  return { tasks, loading, addTask, updateTask, deleteTask, moveTask, user };
}
