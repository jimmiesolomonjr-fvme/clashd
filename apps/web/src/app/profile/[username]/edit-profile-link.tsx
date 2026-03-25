'use client';

import Link from 'next/link';

export function EditProfileLink() {
  return (
    <Link href="/profile/edit" className="btn-outline text-sm">
      Edit Profile
    </Link>
  );
}
