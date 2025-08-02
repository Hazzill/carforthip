"use client";

import { LiffProvider, useLiffContext } from '@/context/LiffProvider';
import Image from 'next/image';

function CustomerHeader() {
    const { profile, loading, error } = useLiffContext();

    if (loading || error) {
        return (
            <header className="bg-[#22252A]  text-white p-4 shadow-md flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-gray-500 animate-pulse"></div>
                <div>
                    <p className="text-sm">กำลังโหลดข้อมูลผู้ใช้...</p>
                    <p className="font-semibold">{error ? 'เกิดข้อผิดพลาด' : 'กรุณารอสักครู่'}</p>
                </div>
            </header>
        );
    }

    return (
        <header className="bg-[#22252A]  text-white p-4 shadow-md flex items-center space-x-3">
            {profile?.pictureUrl && (
                <Image src={profile.pictureUrl} width={48} height={48} alt="Profile" className="w-12 h-12 rounded-full"/>
            )}
            <div>
                <p className="text-sm">สวัสดี</p>
                <p className="font-semibold">{profile?.displayName}</p>
            </div>
        </header>
    );
}

export default function CustomerLayout({ children }) {
    // ระบุ LIFF ID สำหรับลูกค้าที่นี่
    const customerLiffId = process.env.NEXT_PUBLIC_CUSTOMER_LIFF_ID;
    return (
        <LiffProvider liffId={customerLiffId}>
            <div className="max-w-md mx-auto bg-gray-100 min-h-screen">
                <CustomerHeader />
                {children}
            </div>
        </LiffProvider>
    );
}
