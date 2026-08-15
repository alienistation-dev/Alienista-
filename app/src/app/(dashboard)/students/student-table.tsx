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
  Edit2,
  Trash2,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';

interface StudentTableProps {
  initialStudents: Student[];
  userRole: string;
}

const YEARS: YearLevel[] = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const BLOCKS = ['Block 1', 'Block 2', 'Block 3', 'Block 4'];

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
    first_name: '',
    last_name: '',
    course: 'BS Computer Science',
    year: '1st Year' as YearLevel,
    section: 'Block 1',
    status: 'Active' as MemberStatus,
  });

  // Delete Confirmation Modal State
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

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
      first_name: '',
      last_name: '',
      course: 'BS Computer Science',
      year: '1st Year',
      section: 'Block 1',
      status: 'Active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (st: Student) => {
    setEditingStudent(st);

    // Split name if not stored separately
    let fn = st.first_name || '';
    let ln = st.last_name || '';
    if (!fn || !ln) {
      const parts = st.full_name.trim().split(' ');
      ln = parts.pop() || '';
      fn = parts.join(' ') || ln;
    }

    setFormData({
      uid: st.uid,
      student_number: st.student_number,
      first_name: fn,
      last_name: ln,
      course: st.course,
      year: st.year,
      section: st.section.startsWith('Block') ? st.section : `Block ${st.section}`,
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
        const updatedFullName = `${formData.first_name.trim()} ${formData.last_name.trim()}`;
        setStudents((prev) =>
          prev.map((s) =>
            s.id === editingStudent.id
              ? {
                  ...s,
                  ...formData,
                  full_name: updatedFullName,
                }
              : s
          )
        );
        showToast('Student updated successfully!');
      } else {
        const res = await createStudentAction(formData);
        if (!res.success) {
          showToast(res.error, 'err');
          return;
        }
        setStudents((prev) => [res.data, ...prev]);
        showToast(`Student added! Default password is: ${formData.last_name.trim().toUpperCase()}`);
      }
      setIsModalOpen(false);
    });
  };

  const handleConfirmDelete = () => {
    if (!studentToDelete) return;
    startTransition(async () => {
      const res = await deleteStudentAction(studentToDelete.id);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      setStudents((prev) => prev.filter((s) => s.id !== studentToDelete.id));
      showToast(`Student ${studentToDelete.full_name} deleted.`);
      setStudentToDelete(null);
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
    const headers = ['UID', 'Student Number', 'Full Name', 'Course', 'Year', 'Block', 'Status'];
    const rows = filtered.map((s) => [
      `"${s.uid}"`,
      `"${s.student_number}"`,
      `"${s.full_name}"`,
      `"${s.course}"`,
      `"${s.year}"`,
      `"${s.section}"`,
      `"${s.status}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
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
        const parts = line.split(',').map((p) => p.replace(/^"|"$/g, '').trim());
        const fullName = parts[2] || '';
        const nameParts = fullName.split(' ');
        const lastName = nameParts.pop() || '';
        const firstName = nameParts.join(' ') || lastName;

        return {
          uid: parts[0] || '',
          student_number: parts[1] || '',
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          course: parts[3] || 'BS Computer Science',
          year: (parts[4] as YearLevel) || '1st Year',
          section: parts[5] || 'Block 1',
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
          className={`p-3 rounded-2xl text-xs font-semibold border ${
            toast.type === 'ok'
              ? 'bg-[#EBF5EE] border-[#C2E0CC] text-[#1B4332]'
              : 'bg-red-50 border-red-200 text-red-700'
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
              className="w-full bg-white border border-[#E5EBE5] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F]"
            />
          </div>

          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none"
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
            className="bg-white border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none"
          >
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {userRole === 'admin' && (
            <>
              <label className="bg-white border border-[#E5EBE5] hover:border-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors shadow-xs">
                <Upload className="w-3.5 h-3.5 text-[#2D6A4F]" />
                <span className="hidden sm:inline">Import CSV</span>
                <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
              </label>
              <button
                onClick={handleOpenAdd}
                className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Student</span>
              </button>
            </>
          )}
          <button
            onClick={handleExportCsv}
            className="bg-white border border-[#E5EBE5] hover:border-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white border border-[#E5EBE5] rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F8FAF9] text-slate-600 border-b border-[#E5EBE5]">
            <tr>
              <th className="py-3.5 px-4 font-bold uppercase text-[10px] tracking-wider text-[#2D6A4F]">UID</th>
              <th className="py-3.5 px-4 font-bold uppercase text-[10px] tracking-wider">Student No.</th>
              <th className="py-3.5 px-4 font-bold uppercase text-[10px] tracking-wider">Full Name</th>
              <th className="py-3.5 px-4 font-bold uppercase text-[10px] tracking-wider">Year & Block</th>
              <th className="py-3.5 px-4 font-bold uppercase text-[10px] tracking-wider">Status</th>
              {userRole === 'admin' && <th className="py-3.5 px-4 font-bold uppercase text-[10px] tracking-wider text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5EBE5]">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No students found matching your filters.
                </td>
              </tr>
            ) : (
              paginated.map((st) => (
                <tr key={st.id} className="hover:bg-[#F8FAF9] transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-[#1B4332]">{st.uid}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{st.student_number}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">{st.full_name}</td>
                  <td className="py-3 px-4 text-slate-600">{st.year} · {st.section}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        st.status === 'Active'
                          ? 'bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC]'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
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
                          className="p-1.5 hover:bg-[#EBF5EE] text-slate-500 hover:text-[#2D6A4F] rounded-lg transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(st)}
                          title="Edit Student"
                          className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setStudentToDelete(st)}
                          title="Delete Student"
                          className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
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
          <div className="p-8 text-center text-xs text-slate-400 bg-white border border-[#E5EBE5] rounded-2xl">
            No students found.
          </div>
        ) : (
          paginated.map((st) => (
            <div key={st.id} className="p-4 bg-white border border-[#E5EBE5] rounded-2xl space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[#1B4332]">{st.uid}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    st.status === 'Active'
                      ? 'bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC]'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {st.status}
                </span>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">{st.full_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{st.student_number} · {st.year} ({st.section})</div>
              </div>
              {userRole === 'admin' && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5EBE5]">
                  <button
                    onClick={() => handleResetPass(st)}
                    className="text-[11px] text-[#2D6A4F] font-bold hover:underline flex items-center gap-1"
                  >
                    <KeyRound className="w-3 h-3" /> Reset Pass
                  </button>
                  <button
                    onClick={() => handleOpenEdit(st)}
                    className="text-[11px] text-slate-600 font-semibold hover:underline flex items-center gap-1 ml-2"
                  >
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => setStudentToDelete(st)}
                    className="text-[11px] text-red-600 font-semibold hover:underline flex items-center gap-1 ml-2"
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
        <div className="flex items-center justify-between pt-2 text-xs text-slate-500 font-medium">
          <span>Page {page} of {totalPages} ({filtered.length} total)</span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#E5EBE5] hover:border-slate-300 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#E5EBE5] hover:border-slate-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5EBE5] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-extrabold text-[#1B4332]">
              {editingStudent ? 'Edit Student Details' : 'Add New Student'}
            </h3>
            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {editingStudent ? 'UID (System Identifier)' : 'UID (Optional — Auto-assigned if left blank)'}
                </label>
                <input
                  type="text"
                  required={!!editingStudent}
                  placeholder={editingStudent ? 'e.g. ST-2026-0001' : 'Auto-assigned (e.g. ST-2026-0001)'}
                  value={formData.uid}
                  onChange={(e) => setFormData({ ...formData, uid: e.target.value })}
                  className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Student Number (e.g. 2026-8-0123)</label>
                <input
                  type="text"
                  required
                  value={formData.student_number}
                  onChange={(e) => setFormData({ ...formData, student_number: e.target.value })}
                  className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              {/* Separate First Name & Last Name */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Juan"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dela Cruz"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>
              {!editingStudent && formData.last_name && (
                <p className="text-[11px] text-[#2D6A4F] font-semibold bg-[#EBF5EE] p-2 rounded-xl border border-[#C2E0CC]">
                  Default Password: <b>{formData.last_name.trim().toUpperCase()}</b>
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Year Level</label>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value as YearLevel })}
                    className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-2 py-2 text-xs text-slate-900"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Block</label>
                  <select
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-2 py-2 text-xs text-slate-900"
                  >
                    {BLOCKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as MemberStatus })}
                  className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl px-2 py-2 text-xs text-slate-900"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold text-xs transition-colors"
                >
                  {isPending ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5EBE5] rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span>Delete Student Record?</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <b>{studentToDelete.full_name}</b> ({studentToDelete.uid})? This will permanently remove their membership and cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
              >
                {isPending ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
