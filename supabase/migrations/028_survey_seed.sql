-- Platform survey templates (school_id = NULL = available to all schools to clone)
DO $$
DECLARE
  staff_id   UUID := gen_random_uuid();
  parents_id UUID := gen_random_uuid();
  students_id UUID := gen_random_uuid();
BEGIN

INSERT INTO survey_templates (id, school_id, academic_year, name_en, name_ar, target_group, share_token, is_active)
VALUES
  (staff_id,    NULL, NULL, 'Teaching Staff Survey',  'استبيان الكادر التعليمي', 'staff',    NULL, false),
  (parents_id,  NULL, NULL, 'Parents Survey',          'استبيان أولياء الأمور',   'parents',  NULL, false),
  (students_id, NULL, NULL, 'Students Survey',         'استبيان الطلاب',          'students', NULL, false)
ON CONFLICT DO NOTHING;

-- Staff questions (Domain 3 & 5)
INSERT INTO survey_questions (template_id, question_en, question_ar, question_type, domain_id, standard_id, sort_order)
VALUES
  (staff_id, 'Teaching time is used effectively in my classroom',                    'يُستخدم وقت التدريس بفاعلية في فصلي',                           'scale5', '3', '3.2', 1),
  (staff_id, 'I receive adequate professional development support',                   'أتلقى دعماً كافياً للتطوير المهني',                             'scale5', '5', '5.2', 2),
  (staff_id, 'School leadership communicates clear expectations',                     'تُوصل قيادة المدرسة التوقعات بوضوح',                            'scale5', '5', '5.1', 3),
  (staff_id, 'I feel supported in identifying and helping struggling students',       'أشعر بالدعم في تحديد الطلاب المتعثرين ومساعدتهم',               'scale5', '3', '3.5', 4),
  (staff_id, 'The school''s self-evaluation process is inclusive of teacher input',   'تشمل عملية التقييم الذاتي للمدرسة مساهمات المعلمين',            'yesno',  '5', '5.1', 5),
  (staff_id, 'What one improvement would most help your teaching?',                   'ما التحسين الوحيد الذي سيساعدك في التدريس أكثر؟',               'text',   NULL, NULL, 6);

-- Parents questions (Domain 4 & 5)
INSERT INTO survey_questions (template_id, question_en, question_ar, question_type, domain_id, standard_id, sort_order)
VALUES
  (parents_id, 'I feel the school communicates well with parents',           'أشعر أن المدرسة تتواصل بشكل جيد مع أولياء الأمور',    'scale5', '5', '5.4', 1),
  (parents_id, 'My child feels safe and happy at school',                   'يشعر ابني/ابنتي بالأمان والسعادة في المدرسة',          'scale5', '4', '4.3', 2),
  (parents_id, 'The school involves parents in important decisions',        'تشرك المدرسة أولياء الأمور في القرارات المهمة',        'scale5', '5', '5.4', 3),
  (parents_id, 'I am aware of my child''s academic progress',               'أنا على علم بالتقدم الأكاديمي لطفلي',                  'scale5', '1', '1.1', 4),
  (parents_id, 'The school environment is clean and well-maintained',       'بيئة المدرسة نظيفة ومصانة جيداً',                      'yesno',  '4', '4.1', 5),
  (parents_id, 'What would you like the school to improve?',                'ماذا تودّ أن تحسّن المدرسة؟',                           'text',   NULL, NULL, 6);

-- Students questions (Domain 1, 2, 3, 4)
INSERT INTO survey_questions (template_id, question_en, question_ar, question_type, domain_id, standard_id, sort_order)
VALUES
  (students_id, 'My teachers explain things clearly and help me understand', 'يشرح معلموني الأشياء بوضوح ويساعدونني على الفهم',    'scale5', '3', '3.3', 1),
  (students_id, 'I feel encouraged to share my ideas in class',              'أشعر بالتشجيع لمشاركة أفكاري في الفصل',             'scale5', '3', '3.4', 2),
  (students_id, 'I feel safe at school and free from bullying',              'أشعر بالأمان في المدرسة وبعيداً عن التنمر',          'scale5', '4', '4.3', 3),
  (students_id, 'I am proud of my school',                                   'أنا فخور بمدرستي',                                   'scale5', '2', '2.2', 4),
  (students_id, 'My teachers give me useful feedback on my work',            'يعطيني معلموني تغذية راجعة مفيدة على عملي',          'scale5', '3', '3.5', 5),
  (students_id, 'What do you enjoy most about school?',                      'ما الذي تستمتع به أكثر في المدرسة؟',                 'text',   NULL, NULL, 6);

END $$;
