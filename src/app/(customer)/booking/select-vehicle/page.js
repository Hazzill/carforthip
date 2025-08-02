"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/app/lib/firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import Image from 'next/image';
import { useLiffContext } from '@/context/LiffProvider';

const vehicleTypes = ["All", "Sedan", "SUV", "Van"]; // 1. กำหนดประเภทรถสำหรับสร้างปุ่ม

function SelectVehicleContent() {
    const { loading: liffLoading } = useLiffContext();
    const [allVehicles, setAllVehicles] = useState([]);
    const [filteredVehicles, setFilteredVehicles] = useState([]);
    const [passengers, setPassengers] = useState(1);
    const [bags, setBags] = useState(1);
    const [selectedType, setSelectedType] = useState("All"); // 2. State ใหม่สำหรับเก็บประเภทที่เลือก
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const searchParams = useSearchParams();

    // รับข้อมูลจาก Step 1
    const bookingParams = {
        originAddress: searchParams.get('originAddress'),
        originLat: searchParams.get('originLat'),
        originLng: searchParams.get('originLng'),
        destAddress: searchParams.get('destAddress'),
        destLat: searchParams.get('destLat'),
        destLng: searchParams.get('destLng'),
        pickupDateTime: searchParams.get('pickupDateTime'),
    };

    useEffect(() => {
        const fetchVehicles = async () => {
            setLoading(true);
            try {
                const q = query(collection(db, 'vehicles'));
                const querySnapshot = await getDocs(q);
                const vehiclesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAllVehicles(vehiclesData);
            } catch (err) {
                console.error("Error fetching vehicles:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchVehicles();
    }, []);

    // 3. อัปเดต useEffect ให้กรองตามประเภทรถด้วย
    useEffect(() => {
        if (loading) return;
        const filtered = allVehicles.filter(v => {
            const capacityCheck = (v.seatCapacity || 0) >= passengers && (v.bagCapacity || 0) >= bags;
            const typeCheck = selectedType === 'All' ? true : v.type === selectedType;
            return capacityCheck && typeCheck;
        });
        setFilteredVehicles(filtered);
    }, [passengers, bags, selectedType, allVehicles, loading]); // เพิ่ม selectedType ใน dependency

    const handleSelectVehicle = (vehicleId) => {
        const params = new URLSearchParams({
            ...bookingParams,
            vehicleId,
            passengers,
            bags,
        });
        router.push(`./confirm?${params.toString()}`);
    };

    if (liffLoading || loading) return <div className="p-4 text-center">กำลังโหลดรถที่ว่าง...</div>;

    return (
        <main className="p-4 space-y-4">
            <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="font-bold text-lg mb-2">2. เลือกรถที่ต้องการ</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนผู้โดยสาร</label>
                        <input type="number" value={passengers} onChange={(e) => setPassengers(Number(e.target.value))} min="1" className="w-full p-2 border rounded-md"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนกระเป๋า</label>
                        <input type="number" value={bags} onChange={(e) => setBags(Number(e.target.value))} min="0" className="w-full p-2 border rounded-md"/>
                    </div>
                </div>
            </div>
            
            {/* 4. เพิ่ม UI ปุ่มกรองประเภทรถ */}
            <div className="flex justify-center space-x-2">
              {vehicleTypes.map(type => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-4 py-2 text-sm rounded-full font-semibold transition ${
                    selectedType === type
                      ? 'bg-slate-800 text-white shadow-lg'
                      : 'bg-white text-gray-700 shadow-sm'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="space-y-4">
                {filteredVehicles.length > 0 ? (
                    filteredVehicles.map(vehicle => (
                        <div key={vehicle.id} onClick={() => handleSelectVehicle(vehicle.id)} className="bg-white rounded-lg shadow-md p-4 flex items-center space-x-4 cursor-pointer hover:shadow-xl transition">
                            <div className="relative w-24 h-24 flex-shrink-0">
                                <Image src={vehicle.imageUrl || '/placeholder.png'} alt={vehicle.brand} fill style={{ objectFit: 'cover' }} className="rounded-md" />
                            </div>
                            <div className="flex-grow">
                                <p className="font-bold text-lg">{vehicle.brand} {vehicle.model}</p>
                                <p className="text-sm text-gray-500">ผู้โดยสาร: {vehicle.seatCapacity || 'N/A'} | กระเป๋า: {vehicle.bagCapacity || 'N/A'}</p>
                                <p className="text-sm text-gray-500 mt-1">{vehicle.details}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center text-gray-500 pt-10 bg-white p-6 rounded-lg shadow">
                        <p>ไม่พบรถที่ตรงกับความต้องการของคุณ</p>
                    </div>
                )}
            </div>
        </main>
    );
}

export default function SelectVehiclePage() {
    return (
        <Suspense fallback={<div className="p-4 text-center">Loading Page...</div>}>
            <SelectVehicleContent />
        </Suspense>
    );
}
