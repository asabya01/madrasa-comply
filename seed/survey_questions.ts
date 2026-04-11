/**
 * Seed the 3 platform survey templates with their default question sets.
 * Called once by Super Admin from the SuperAdminPage.
 * Idempotent: deletes and re-inserts platform templates (school_id IS NULL).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Question definitions ────────────────────────────────────

const STAFF_QUESTIONS = [
  { question_en: 'Teachers plan lessons effectively to meet student needs',                      question_ar: 'يخطط المعلمون للدروس بفاعلية لتلبية احتياجات الطلبة',                     domain_id: '3', standard_id: '3.1', sort_order: 1  },
  { question_en: 'Classroom management supports student learning',                               question_ar: 'تدعم إدارة الفصل الدراسي تعلم الطلبة',                                    domain_id: '3', standard_id: '3.2', sort_order: 2  },
  { question_en: 'Teaching strategies engage all learners',                                      question_ar: 'تُشرك استراتيجيات التدريس جميع المتعلمين',                                 domain_id: '3', standard_id: '3.3', sort_order: 3  },
  { question_en: 'Assessment practices are fair and consistent',                                 question_ar: 'ممارسات التقييم عادلة ومتسقة',                                             domain_id: '3', standard_id: '3.5', sort_order: 4  },
  { question_en: 'School leadership communicates a clear vision',                                question_ar: 'توصل قيادة المدرسة رؤية واضحة',                                            domain_id: '5', standard_id: '5.1', sort_order: 5  },
  { question_en: 'Leaders support teachers\' professional development',                          question_ar: 'يدعم القادة التطوير المهني للمعلمين',                                      domain_id: '5', standard_id: '5.2', sort_order: 6  },
  { question_en: 'Resources are allocated effectively to support learning',                      question_ar: 'تُخصص الموارد بفاعلية لدعم التعلم',                                        domain_id: '5', standard_id: '5.3', sort_order: 7  },
  { question_en: 'Parents are engaged in school life',                                           question_ar: 'يشارك أولياء الأمور في الحياة المدرسية',                                   domain_id: '5', standard_id: '5.4', sort_order: 8  },
  { question_en: 'Roles and responsibilities are clearly defined',                               question_ar: 'الأدوار والمسؤوليات محددة بوضوح',                                          domain_id: '5', standard_id: '5.5', sort_order: 9  },
  { question_en: 'School policies are consistently implemented',                                 question_ar: 'تُطبَّق سياسات المدرسة باتساق',                                            domain_id: '5', standard_id: '5.5', sort_order: 10 },
  { question_en: 'Staff collaboration improves teaching quality',                                question_ar: 'يحسّن تعاون الكادر التعليمي جودة التدريس',                                 domain_id: '3', standard_id: '3.4', sort_order: 11 },
  { question_en: 'Students with special needs receive appropriate support',                      question_ar: 'يتلقى الطلبة ذوو الاحتياجات الخاصة الدعم المناسب',                         domain_id: '3', standard_id: '3.3', sort_order: 12 },
  { question_en: 'The school environment is safe and welcoming',                                 question_ar: 'البيئة المدرسية آمنة ومرحِّبة',                                            domain_id: '4', standard_id: '4.1', sort_order: 13 },
  { question_en: 'Leadership sets high expectations for staff and students',                     question_ar: 'تضع القيادة توقعات عالية للكادر والطلبة',                                  domain_id: '5', standard_id: '5.1', sort_order: 14 },
  { question_en: 'I am satisfied with my professional development opportunities',                question_ar: 'أنا راضٍ عن فرص التطوير المهني المتاحة لي',                                domain_id: '5', standard_id: '5.2', sort_order: 15 },
];

const PARENTS_QUESTIONS = [
  { question_en: 'My child feels safe and happy at school',                                      question_ar: 'يشعر طفلي بالأمان والسعادة في المدرسة',                                   domain_id: '4', standard_id: '4.1', sort_order: 1  },
  { question_en: 'The school communicates regularly with parents',                               question_ar: 'تتواصل المدرسة بانتظام مع أولياء الأمور',                                  domain_id: '5', standard_id: '5.4', sort_order: 2  },
  { question_en: 'My child is making good academic progress',                                    question_ar: 'يحقق طفلي تقدماً أكاديمياً جيداً',                                        domain_id: '1', standard_id: '1.2', sort_order: 3  },
  { question_en: 'The school supports my child\'s personal development',                         question_ar: 'تدعم المدرسة التطور الشخصي لطفلي',                                        domain_id: '2', standard_id: '2.1', sort_order: 4  },
  { question_en: 'My child demonstrates good values and behaviour',                              question_ar: 'يُظهر طفلي قيماً وسلوكاً حسناً',                                          domain_id: '2', standard_id: '2.1', sort_order: 5  },
  { question_en: 'The school environment is clean and well-maintained',                          question_ar: 'البيئة المدرسية نظيفة ومُصانة جيداً',                                      domain_id: '4', standard_id: '4.1', sort_order: 6  },
  { question_en: 'I am able to support my child\'s learning at home',                            question_ar: 'أستطيع دعم تعلم طفلي في المنزل',                                          domain_id: '5', standard_id: '5.4', sort_order: 7  },
  { question_en: 'The school celebrates students\' achievements',                                question_ar: 'تحتفل المدرسة بإنجازات الطلبة',                                           domain_id: '4', standard_id: '4.2', sort_order: 8  },
  { question_en: 'My child is encouraged to develop their talents',                              question_ar: 'يُشجَّع طفلي على تطوير مواهبه',                                           domain_id: '4', standard_id: '4.2', sort_order: 9  },
  { question_en: 'The school respects Omani identity and culture',                               question_ar: 'تحترم المدرسة الهوية والثقافة العُمانية',                                 domain_id: '2', standard_id: '2.2', sort_order: 10 },
  { question_en: 'My child\'s wellbeing is taken care of at school',                             question_ar: 'يُعتنى برفاهية طفلي في المدرسة',                                          domain_id: '4', standard_id: '4.3', sort_order: 11 },
  { question_en: 'I trust the school\'s leadership and management',                              question_ar: 'أثق في قيادة المدرسة وإدارتها',                                           domain_id: '5', standard_id: '5.1', sort_order: 12 },
];

const STUDENTS_QUESTIONS = [
  { question_en: 'My teachers explain lessons clearly',                                          question_ar: 'يشرح معلمي الدروس بوضوح',                                                 domain_id: '3', standard_id: '3.3', sort_order: 1  },
  { question_en: 'I feel motivated to learn at school',                                          question_ar: 'أشعر بالدافعية للتعلم في المدرسة',                                        domain_id: '2', standard_id: '2.1', sort_order: 2  },
  { question_en: 'I am given opportunities to share my ideas in class',                          question_ar: 'تُتاح لي فرص لمشاركة أفكاري في الفصل',                                   domain_id: '3', standard_id: '3.4', sort_order: 3  },
  { question_en: 'My teachers use interesting activities in lessons',                            question_ar: 'يستخدم معلمي أنشطة مثيرة للاهتمام في الدروس',                            domain_id: '3', standard_id: '3.3', sort_order: 4  },
  { question_en: 'I understand what I need to do to improve',                                    question_ar: 'أفهم ما يجب عليّ فعله للتحسن',                                            domain_id: '3', standard_id: '3.5', sort_order: 5  },
  { question_en: 'I feel safe at school',                                                        question_ar: 'أشعر بالأمان في المدرسة',                                                 domain_id: '4', standard_id: '4.1', sort_order: 6  },
  { question_en: 'I am proud to be Omani',                                                       question_ar: 'أنا فخور بكوني عُمانياً',                                                 domain_id: '2', standard_id: '2.2', sort_order: 7  },
  { question_en: 'I know my rights and responsibilities at school',                              question_ar: 'أعرف حقوقي ومسؤولياتي في المدرسة',                                        domain_id: '2', standard_id: '2.1', sort_order: 8  },
  { question_en: 'I am encouraged to read regularly',                                            question_ar: 'يُشجَّعني على القراءة المنتظمة',                                          domain_id: '1', standard_id: '1.3', sort_order: 9  },
  { question_en: 'I use technology effectively in my learning',                                  question_ar: 'أستخدم التقنية بفاعلية في تعلمي',                                         domain_id: '1', standard_id: '1.3', sort_order: 10 },
  { question_en: 'My teachers help me when I find work difficult',                               question_ar: 'يساعدني معلمي عندما أجد صعوبة في العمل',                                  domain_id: '3', standard_id: '3.5', sort_order: 11 },
  { question_en: 'I feel my opinions matter at school',                                          question_ar: 'أشعر أن آرائي مهمة في المدرسة',                                           domain_id: '2', standard_id: '2.1', sort_order: 12 },
];

// ─── Seed function ────────────────────────────────────────────

export async function seedSurveyQuestions(supabase: SupabaseClient): Promise<{
  created: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let created = 0;

  // Delete existing platform templates (school_id IS NULL) — cascades to questions
  const { error: delErr } = await supabase
    .from('survey_templates')
    .delete()
    .is('school_id', null);
  if (delErr) {
    errors.push(`Delete old templates: ${delErr.message}`);
    return { created, errors };
  }

  const templates = [
    { name_en: 'Teaching Staff Survey', name_ar: 'استبيان الكادر التعليمي', target_group: 'staff',    questions: STAFF_QUESTIONS    },
    { name_en: 'Parents Survey',        name_ar: 'استبيان أولياء الأمور',   target_group: 'parents',  questions: PARENTS_QUESTIONS  },
    { name_en: 'Students Survey',       name_ar: 'استبيان الطلبة',          target_group: 'students', questions: STUDENTS_QUESTIONS },
  ];

  for (const tpl of templates) {
    // Insert template
    const { data: newTpl, error: tplErr } = await supabase
      .from('survey_templates')
      .insert({
        school_id: null,
        name_en: tpl.name_en,
        name_ar: tpl.name_ar,
        target_group: tpl.target_group,
        is_active: false,
      })
      .select('id')
      .single();

    if (tplErr || !newTpl) {
      errors.push(`Insert template ${tpl.name_en}: ${tplErr?.message ?? 'no data'}`);
      continue;
    }

    // Insert questions
    const qRows = tpl.questions.map((q) => ({
      template_id: newTpl.id,
      question_en: q.question_en,
      question_ar: q.question_ar,
      question_type: 'scale_1_5',
      domain_id: q.domain_id,
      standard_id: q.standard_id,
      sort_order: q.sort_order,
    }));

    const { error: qErr } = await supabase.from('survey_questions').insert(qRows);
    if (qErr) {
      errors.push(`Insert questions for ${tpl.name_en}: ${qErr.message}`);
    } else {
      created += qRows.length;
    }
  }

  return { created, errors };
}
