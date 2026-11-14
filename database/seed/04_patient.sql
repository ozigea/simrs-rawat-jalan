-- 30 fake patients. NIK prefix 9999 marks them as dummy; MRN comes from patient_mrn_seq.
INSERT INTO patient (nik, name, birth_date, gender, phone, address)
SELECT '9999' || lpad(g::text, 12, '0'),
       CASE WHEN g % 2 = 1
            THEN (ARRAY['Agus','Bambang','Cahyo','Darmawan','Eko','Fajar','Guntur','Hadi','Irfan','Joko','Kurniawan','Lukman','Mulyadi','Nugroho','Oki'])[(g / 2) % 15 + 1]
            ELSE (ARRAY['Ani','Bella','Citra','Dian','Endang','Fitri','Gita','Hesti','Intan','Jelita','Kartika','Lina','Maya','Novi','Putri'])[(g / 2) % 15 + 1]
       END || ' ' ||
       (ARRAY['Saputra','Wijaya','Hidayat','Kusuma','Rahayu','Setiawan','Permana','Utami','Nugraha','Lestari'])[g % 10 + 1],
       DATE '1950-01-01' + (g * 811 % 24000),
       CASE WHEN g % 2 = 1 THEN 'M' ELSE 'F' END,
       '0812000' || lpad(g::text, 5, '0'),
       'Jl. Contoh No. ' || g || ', Kota Dummy'
FROM generate_series(1, 30) AS g
ON CONFLICT (nik) DO NOTHING;
