import React from 'react';
import { getStudentsAction } from '@/lib/actions/students';
import { getSessionUser } from '@/lib/session';
import { StudentTable } from './student-table';

export default async function StudentsPage() {
  const user = await getSessionUser();
  const res = await getStudentsAction();

  if (!res.success) {
    return (
      <div className="p-6 rounded-2xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
        Failed to load students: {res.error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Student Directory</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          {user?.role === 'admin'
            ? 'Manage registered students, issue ID credentials, and export data.'
            : 'Directory roster view for officers.'}
        </p>
      </div>

      <StudentTable initialStudents={res.data} userRole={user?.role || 'officer'} />
    </div>
  );
}
