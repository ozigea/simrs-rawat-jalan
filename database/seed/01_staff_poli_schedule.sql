-- Demo data only. Idempotent: safe to run on every start.
INSERT INTO medical_staff (code, name, staff_type, license_no, specialization, phone) VALUES
 ('DR-001', 'dr. Andi Pratama',            'DOCTOR',      'STR-DUMMY-001', 'Dokter Umum',        '081200000001'),
 ('DR-002', 'dr. Budi Santoso',            'DOCTOR',      'STR-DUMMY-002', 'Dokter Umum',        '081200000002'),
 ('DR-003', 'dr. Citra Lestari, Sp.A',     'DOCTOR',      'STR-DUMMY-003', 'Spesialis Anak',     '081200000003'),
 ('DR-004', 'dr. Dewi Anggraini, Sp.PD',   'DOCTOR',      'STR-DUMMY-004', 'Spesialis Penyakit Dalam', '081200000004'),
 ('DR-005', 'dr. Eko Wibowo, Sp.PD',       'DOCTOR',      'STR-DUMMY-005', 'Spesialis Penyakit Dalam', '081200000005'),
 ('DR-006', 'drg. Fitri Handayani',        'DOCTOR',      'STR-DUMMY-006', 'Dokter Gigi',        '081200000006'),
 ('NS-001', 'Ns. Gita Permata',            'NURSE',       'SIP-DUMMY-001', NULL,                 '081200000007'),
 ('PH-001', 'Hendra Kusuma, S.Farm., Apt.','PHARMACIST',  'SIPA-DUMMY-001', NULL,                '081200000008'),
 ('LB-001', 'Indah Sari, A.Md.AK',         'LAB_ANALYST', 'SIPTLM-DUMMY-001', NULL,              '081200000009')
ON CONFLICT (code) DO NOTHING;

INSERT INTO polyclinic (code, name, registration_fee) VALUES
 ('POL-UMUM',  'Poli Umum',           20000),
 ('POL-ANAK',  'Poli Anak',           35000),
 ('POL-DALAM', 'Poli Penyakit Dalam', 40000),
 ('POL-GIGI',  'Poli Gigi',           30000)
ON CONFLICT (code) DO NOTHING;

-- ISO day of week: 1 = Monday .. 7 = Sunday. dr. Andi also practises on Sunday so the
-- registration flow can be exercised on any day of the week.
INSERT INTO doctor_schedule (doctor_id, polyclinic_id, day_of_week, start_time, end_time, quota)
SELECT d.id, p.id, s.dow, s.st::time, s.et::time, s.quota
FROM (VALUES
 ('DR-001', 'POL-UMUM', 1, '08:00', '14:00', 60), ('DR-001', 'POL-UMUM', 2, '08:00', '14:00', 60),
 ('DR-001', 'POL-UMUM', 3, '08:00', '14:00', 60), ('DR-001', 'POL-UMUM', 4, '08:00', '14:00', 60),
 ('DR-001', 'POL-UMUM', 5, '08:00', '14:00', 60), ('DR-001', 'POL-UMUM', 6, '08:00', '14:00', 60),
 ('DR-001', 'POL-UMUM', 7, '08:00', '12:00', 40),
 ('DR-002', 'POL-UMUM', 1, '14:00', '20:00', 50), ('DR-002', 'POL-UMUM', 2, '14:00', '20:00', 50),
 ('DR-002', 'POL-UMUM', 3, '14:00', '20:00', 50), ('DR-002', 'POL-UMUM', 4, '14:00', '20:00', 50),
 ('DR-002', 'POL-UMUM', 5, '14:00', '20:00', 50),
 ('DR-003', 'POL-ANAK', 1, '09:00', '13:00', 30), ('DR-003', 'POL-ANAK', 3, '09:00', '13:00', 30),
 ('DR-003', 'POL-ANAK', 5, '09:00', '13:00', 30), ('DR-003', 'POL-ANAK', 6, '09:00', '12:00', 25),
 ('DR-004', 'POL-DALAM', 1, '09:00', '14:00', 30), ('DR-004', 'POL-DALAM', 2, '09:00', '14:00', 30),
 ('DR-004', 'POL-DALAM', 4, '09:00', '14:00', 30),
 ('DR-005', 'POL-DALAM', 3, '14:00', '19:00', 25), ('DR-005', 'POL-DALAM', 5, '14:00', '19:00', 25),
 ('DR-005', 'POL-DALAM', 6, '09:00', '13:00', 25),
 ('DR-006', 'POL-GIGI',  1, '10:00', '16:00', 20), ('DR-006', 'POL-GIGI',  2, '10:00', '16:00', 20),
 ('DR-006', 'POL-GIGI',  4, '10:00', '16:00', 20), ('DR-006', 'POL-GIGI',  5, '10:00', '16:00', 20),
 ('DR-006', 'POL-GIGI',  6, '09:00', '13:00', 20)
) AS s(doc, poli, dow, st, et, quota)
JOIN medical_staff d ON d.code = s.doc
JOIN polyclinic p ON p.code = s.poli
ON CONFLICT DO NOTHING;
