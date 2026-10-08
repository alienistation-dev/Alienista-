-- Fix: Remove image/gif from student-avatars bucket allowed MIME types.
-- The application layer (uploadStudentAvatarAction) already blocks GIFs, but the
-- bucket still listed it, meaning direct storage API calls could bypass the block.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'student-avatars';
