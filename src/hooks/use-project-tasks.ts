"use client"

import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where, orderBy, FieldValue, Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Task, TaskStatus } from './use-tasks';

export interface ProjectActivity {
  id: string;
  projectId: string;
  type: 'auto' | 'manual';
  content: string;
  timestamp: any;
  createdBy: string;
}

export function useProjectTasks(projectId: string | undefined, projectStatus: string = 'active', progressMode: string = 'auto') {
  const firestore = useFirestore();
  const { user } = useUser();

  // Query tasks for this project
  const tasksQuery = useMemo(() => {
    if (!firestore || !projectId) return null;
    return query(
      collection(firestore, 'tasks'),
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, projectId]);

  const { data: tasks, loading: tasksLoading } = useCollection<Task>(tasksQuery);

  // Query activities for this project
  const activitiesQuery = useMemo(() => {
    if (!firestore || !projectId) return null;
    return query(
      collection(firestore, 'project_activities'),
      where('projectId', '==', projectId),
      orderBy('timestamp', 'desc')
    );
  }, [firestore, projectId]);

  const { data: activities, loading: activitiesLoading } = useCollection<ProjectActivity>(activitiesQuery);

  // Recalculate progress helper
  const updateProjectProgress = async (currentTasks: Task[]) => {
    if (!firestore || !projectId || progressMode !== 'auto') return;

    let newProgress = 0;
    if (currentTasks.length === 0) {
      // Fallback progress based on status
      newProgress = projectStatus === 'completed' ? 100
        : projectStatus === 'active' ? 60
          : projectStatus === 'archived' ? 30
            : 0;
    } else {
      const completed = currentTasks.filter(t => t.status === 'done').length;
      newProgress = Math.round((completed / currentTasks.length) * 100);
    }

    try {
      const projRef = doc(firestore, 'projects', projectId);
      await updateDoc(projRef, { progress: newProgress });
      if (process.env.NODE_ENV !== 'production') console.debug(`[PROGRESS] Automatically updated project progress to ${newProgress}%`);
    } catch (e) {
      console.error("[PROGRESS] Failed to update project progress:", e);
    }
  };

  const addProjectTask = async (title: string, description: string = '', categories: string[] = [], labels: string[] = []) => {
    if (!user || !firestore || !projectId) return;

    const tasksRef = collection(firestore, 'tasks');
    const data = {
      title,
      description,
      status: 'todo' as TaskStatus,
      categories,
      labels,
      userId: user.uid,
      projectId,
      createdAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(tasksRef, data);

      // Log activity
      const userName = user.displayName || user.email || 'Agent';
      await addDoc(collection(firestore, 'project_activities'), {
        projectId,
        type: 'auto',
        content: `${userName} created task: "${title}"`,
        timestamp: serverTimestamp(),
        createdBy: user.email || user.uid,
      });

      // Recalculate progress
      const updatedTasks = [...(tasks || []), { id: docRef.id, ...data } as unknown as Task];
      await updateProjectProgress(updatedTasks);

    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: tasksRef.path,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  const updateProjectTask = async (id: string, updates: Partial<Task>) => {
    if (!firestore || !projectId || !user) return;
    const taskRef = doc(firestore, 'tasks', id);

    try {
      const oldTask = tasks?.find(t => t.id === id);
      await updateDoc(taskRef, updates);

      // Check if status changed
      if (updates.status && oldTask && oldTask.status !== updates.status) {
        const userName = user.displayName || user.email || 'Agent';
        let action = `moved task "${oldTask.title}" to ${updates.status}`;
        if (updates.status === 'done') {
          action = `completed task: "${oldTask.title}"`;
        }

        await addDoc(collection(firestore, 'project_activities'), {
          projectId,
          type: 'auto',
          content: `${userName} ${action}`,
          timestamp: serverTimestamp(),
          createdBy: user.email || user.uid,
        });
      }

      // Recalculate progress
      const updatedTasks = (tasks || []).map(t => t.id === id ? { ...t, ...updates } as Task : t);
      await updateProjectProgress(updatedTasks);

    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: taskRef.path,
        operation: 'update',
        requestResourceData: updates,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  const deleteProjectTask = async (id: string) => {
    if (!firestore || !projectId || !user) return;
    const taskRef = doc(firestore, 'tasks', id);

    try {
      const oldTask = tasks?.find(t => t.id === id);
      const title = oldTask?.title || 'Untitled Task';

      await deleteDoc(taskRef);

      // Log activity
      const userName = user.displayName || user.email || 'Agent';
      await addDoc(collection(firestore, 'project_activities'), {
        projectId,
        type: 'auto',
        content: `${userName} deleted task: "${title}"`,
        timestamp: serverTimestamp(),
        createdBy: user.email || user.uid,
      });

      // Recalculate progress
      const updatedTasks = (tasks || []).filter(t => t.id !== id);
      await updateProjectProgress(updatedTasks);

    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: taskRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  return {
    tasks: tasks || [],
    tasksLoading,
    activities: activities || [],
    activitiesLoading,
    addProjectTask,
    updateProjectTask,
    deleteProjectTask,
  };
}
