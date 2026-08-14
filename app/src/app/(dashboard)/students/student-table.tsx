'use client';

import React, { useState, useTransition } from 'react';
import { Student, YearLevel, MemberStatus } from '@/lib/types/models';
import {
  createStudentAction,
  updateStudentAction,
  deleteStudentAction,
  resetStudentPasswordAction,
  bulkImportStudentsCsvAction,
} from '@/lib/actions/students';
import {
  Search,
  Plus,
  Upload,
  Download,
  MoreVertical,
  Edit2,
  Trash2,
  KeyRound,
  Filter,
  Users,
} from 'lucide-react';

interface StudentTableProps {
  initialStudents: Student[];
  userRole: string;
}

const YEARS: YearLevel[] = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Alumni'];

export function StudentTable({ initialStudents, userRole }: StudentTableProps) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({
    uid: '',
    student_number: '',
    full_name: '',
    course: 'BS Computer Science',
    year: '1st Year' as YearLevel,
    section: '1',
    status: 'Active' as MemberStatus,
  });

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Filter & Search Logic
  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      s.full_name.toLowerCase().includes(q) ||
      s.uid.toLowerCase().includes(q) ||
      s.student_number.toLowerCase().includes(q);
    const matchesYear = yearFilter === 'All' || s.year === yearFilter;
    const matchesStatus = statusFilter === 'All' || s.status === statusFilter;
    return matchesSearch && matchesYear && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setFormData({
      uid: '',
      student_number: '',
      full_name: '',
      course: 'BS Computer Science',
      year: '1st Year',
      section: '1',
      status: 'Active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (st: Student) => {
    setEditingStudent(st);
    setFormData({
      uid: st.uid,
      student_number: st.student_number,
      full_name: st.full_name,
      course: st.course,
      year: st.year,
      section: st.section,
      status: st.status,
    });
    setIsModalOpen(true);
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      if (editingStudent) {
        const res = await updateStudentAction(editingStudent.id, formData);
        if (!res.success) {
          showToast(res.error, 'err');
          return;
        }
        setStudents((prev) =>
          prev.map((s) => (s.id === editingStudent.id ? { ...s, ...formData } : s))
        );
        showToast('Student updated successfully!');
      } else {
        const res = await createStudentAction(formData);
        if (!res.success) {
          showToast(res.error, 'err');
          return;
        }
        setStudents((prev) => [res.data, ...prev]);
        showToast('Student added successfully!');
      }
      setIsModalOpen(false);
    });
  };

  const handleDelete = (st: Student) => {
    if (!confirm(`Are you sure you want to delete ${st.full_name}?`)) return;
    startTransition(async () => {
      const res = await deleteStudentAction(st.id);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      setStudents((prev) => prev.filter((s) => s.id !== st.id));
      showToast('Student deleted.');
    });
  };

  const handleResetPass = (st: Student) => {
    startTransition(async () => {
      const res = await resetStudentPasswordAction(st.id);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      showToast(`Password for ${st.full_name} reset to default.`);
    });
  };

  const handleExportCsv = () => {
    const headers = ['uid', 'student_number', 'full_name', 'course', 'year', 'section', 'status'];
    const rows = filtered.map((s) => [
      `"${s.uid}"`,
      `"${s.student_number}"`,
      `"${s.full_name}"`,
      `"${s.course}"`,
      `"${s.year}"`,
      `"${s.section}"`,
      `"${s.status}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `students_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        showToast('CSV file is empty or invalid', 'err');
        return;
      }

      const rows = lines.slice(1).map((line) => {
        // Simple CSV splitter respecting quotes
        const parts = line.split(',').map((p) => p.replace(/^"|"$/g, '').trim());
        return {
          uid: parts[0] || '',
          student_number: parts[1] || '',
          full_name: parts[2] || '',
          course: parts[3] || 'BS Computer Science',
          year: (parts[4] as YearLevel) || '1st Year',
          section: parts[5] || '1',
          status: (parts[6] as MemberStatus) || 'Active',
        };
      });

      startTransition(async () => {
        const res = await bulkImportStudentsCsvAction(rows);
        if (!res.success) {
          showToast(res.error, 'err');
          return;
        }
        showToast(`Imported ${res.data.imported} students! (${res.data.failed} failed)`);
        window.location.reload();
      });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`p-3 rounded-xl text-xs font-medium border ${
            toast.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-red-950/60 border-red-800 text-red-300'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 gap-2 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, UID, or student no..."
              className="w-full bg-[#151E33] border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#151E33] border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Years</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[#151E33] border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Alumni">Alumni</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {userRole === 'admin' && (
            <>
              <label className="bg-[#151E33] border border-slate-800 hover:border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Import CSV</span>
                <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
              </label>
              <button
                onClick={handleOpenAdd}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Student</span>
              </button>
            </>
          )}
          <button
            onClick={handleExportCsv}
            className="bg-[#151E33] border border-slate-800 hover:border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-[#151E33] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0B1120] text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-3 px-4 font-semibold">UID</th>
              <th className="py-3 px-4 font-semibold">Student No.</th>
              <th className="py-3 px-4 font-semibold">Full Name</th>
              <th className="py-3 px-4 font-semibold">Year & Section</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              {userRole === 'admin' && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No students found matching your filters.
                </td>
              </tr>
            ) : (
              paginated.map((st) => (
                <tr key={st.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">{st.uid}</td>
                  <td className="py-3 px-4 font-mono text-slate-300">{st.student_number}</td>
                  <td className="py-3 px-4 font-medium text-white">{st.full_name}</td>
                  <td className="py-3 px-4 text-slate-400">{st.year} · Sec. {st.section}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        st.status === 'Active'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {st.status}
                    </span>
                  </td>
                  {userRole === 'admin' && (
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleResetPass(st)}
                          title="Reset Password to Default"
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-lg transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(st)}
                          title="Edit Student"
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(st)}
                          title="Delete Student"
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-2.5">
        {paginated.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-[#151E33] border border-slate-800 rounded-2xl">
            No students found.
          </div>
        ) : (
          paginated.map((st) => (
            <div key={st.id} className="p-4 bg-[#151E33] border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400">{st.uid}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    st.status === 'Active'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {st.status}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{st.full_name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{st.student_number} · {st.year} (Sec. {st.section})</div>
              </div>
              {userRole === 'admin' && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                  <button
                    onClick={() => handleResetPass(st)}
                    className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <KeyRound className="w-3 h-3" /> Reset PIN
                  </button>
                  <button
                    onClick={() => handleOpenEdit(st)}
                    className="text-[11px] text-slate-300 hover:underline flex items-center gap-1 ml-2"
                  >
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(st)}
                    className="text-[11px] text-red-400 hover:underline flex items-center gap-1 ml-2"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
          <span>Page {page} of {totalPages} ({filtered.length} total)</span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2.5 py-1 rounded-lg bg-[#151E33] border border-slate-800 hover:border-slate-700 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 rounded-lg bg-[#151E33] border border-slate-800 hover:border-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#151E33] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">
              {editingStudent ? 'Edit Student Details' : 'Add New Student'}
            </h3>
            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">UID (e.g. ST-2026-0001)</label>
                <input
                  type="text"
                  required
                  value={formData.uid}
                  onChange={(e) => setFormData({ ...formData, uid: e.target.value })}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Student Number (e.g. 2023-8-0044)</label>
                <input
                  type="text"
                  required
                  value={formData.student_number}
                  onChange={(e) => setFormData({ ...formData, student_number: e.target.value })}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Year Level</label>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value as YearLevel })}
                    className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-100"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Section</label>
                  <input
                    type="text"
                    required
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as MemberStatus })}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-100"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Alumni">Alumni</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
                >
                  {isPending ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
