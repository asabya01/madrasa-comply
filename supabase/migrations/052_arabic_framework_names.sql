-- ─────────────────────────────────────────────────────────────────────────────
-- 052: Seed official OAAAQA 2024 Arabic names for all framework tables.
-- Columns (name_ar / description_ar) already exist — this is a data migration.
-- Arabic text taken verbatim from دليل المدرسة — OAAAQA 2024.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── DOMAINS ─────────────────────────────────────────────────────────────────

UPDATE domains SET name_ar = 'الإنجاز الدراسي'
  WHERE id = '1';

UPDATE domains SET name_ar = 'النمو الشخصي'
  WHERE id = '2';

UPDATE domains SET name_ar = 'التدريس والتقويم'
  WHERE id = '3';

UPDATE domains SET name_ar = 'مناخ المدرسة وبيئة التعلم'
  WHERE id = '4';

UPDATE domains SET name_ar = 'القيادة والإدارة والحوكمة'
  WHERE id = '5';

-- ─── STANDARDS ───────────────────────────────────────────────────────────────

-- Domain 1
UPDATE standards SET name_ar = 'التحصيل الدراسي'      WHERE id = '1.1';
UPDATE standards SET name_ar = 'التقدم الدراسي'        WHERE id = '1.2';
UPDATE standards SET name_ar = 'مهارات التعلم'         WHERE id = '1.3';

-- Domain 2
UPDATE standards SET name_ar = 'القيم والسلوك'                WHERE id = '2.1';
UPDATE standards SET name_ar = 'الهوية والمواطنة'              WHERE id = '2.2';
UPDATE standards SET name_ar = 'الوعي الصحي والبيئي'           WHERE id = '2.3';
UPDATE standards SET name_ar = 'الابتكار وريادة الأعمال'       WHERE id = '2.4';

-- Domain 3
UPDATE standards SET name_ar = 'تخطيط المنهاج الدراسي'        WHERE id = '3.1';
UPDATE standards SET name_ar = 'إدارة الصف'                    WHERE id = '3.2';
UPDATE standards SET name_ar = 'فاعلية التدريس'                WHERE id = '3.3';
UPDATE standards SET name_ar = 'تعزيز مهارات التعلم'           WHERE id = '3.4';
UPDATE standards SET name_ar = 'التقويم ومساندة التقدم'        WHERE id = '3.5';

-- Domain 4
UPDATE standards SET name_ar = 'جودة بيئة التعلم'                    WHERE id = '4.1';
UPDATE standards SET name_ar = 'تعزيز مواهب الطلبة وقدراتهم'         WHERE id = '4.2';
UPDATE standards SET name_ar = 'الدعم والرعاية'                       WHERE id = '4.3';
UPDATE standards SET name_ar = 'تنمية مهارات البحث العلمي'            WHERE id = '4.4';

-- Domain 5
UPDATE standards SET name_ar = 'قيادة التغيير'                        WHERE id = '5.1';
UPDATE standards SET name_ar = 'قيادة التعليم والتعلم'                WHERE id = '5.2';
UPDATE standards SET name_ar = 'الكفاءة الإدارية'                     WHERE id = '5.3';
UPDATE standards SET name_ar = 'الشراكة مع أولياء الأمور والمجتمع'   WHERE id = '5.4';
UPDATE standards SET name_ar = 'الحوكمة'                              WHERE id = '5.5';

-- ─── INDICATORS ──────────────────────────────────────────────────────────────

-- 1.1
UPDATE indicators SET description_ar = 'المستويات التحصيلية'
  WHERE id = '1.1.1';
UPDATE indicators SET description_ar = 'التحصيل في الأعمال الصفية وغير الصفية'
  WHERE id = '1.1.2';
UPDATE indicators SET description_ar = 'عدالة التحصيل الدراسي'
  WHERE id = '1.1.3';

-- 1.2
UPDATE indicators SET description_ar = 'المستويات التحصيلية بمرور الوقت'
  WHERE id = '1.2.1';
UPDATE indicators SET description_ar = 'التقدم الدراسي في الحصص الدراسية'
  WHERE id = '1.2.2';
UPDATE indicators SET description_ar = 'تقدم الطلبة ذوي الاحتياجات الخاصة'
  WHERE id = '1.2.3';

-- 1.3
UPDATE indicators SET description_ar = 'مهارات التعلم الذاتي'
  WHERE id = '1.3.1';
UPDATE indicators SET description_ar = 'مهارات التعلم التعاوني'
  WHERE id = '1.3.2';
UPDATE indicators SET description_ar = 'مهارات التفكير العليا'
  WHERE id = '1.3.3';
UPDATE indicators SET description_ar = 'تطبيق التعلم في الحياة اليومية'
  WHERE id = '1.3.4';
UPDATE indicators SET description_ar = 'المهارات الرقمية'
  WHERE id = '1.3.5';
UPDATE indicators SET description_ar = 'ثقافة القراءة'
  WHERE id = '1.3.6';

-- 2.1
UPDATE indicators SET description_ar = 'التمسك بالقيم الإنسانية المشتركة'
  WHERE id = '2.1.1';
UPDATE indicators SET description_ar = 'إدراك الحقوق والواجبات'
  WHERE id = '2.1.2';
UPDATE indicators SET description_ar = 'الحماس والدافعية للتعلم'
  WHERE id = '2.1.3';

-- 2.2
UPDATE indicators SET description_ar = 'الاعتزاز بالهوية العمانية وتاريخ سلطنة عمان وثقافتها والولاء للوطن وللسلطان'
  WHERE id = '2.2.1';
UPDATE indicators SET description_ar = 'الانتماء للهوية العربية والإسلامية وتقدير اللغة العربية'
  WHERE id = '2.2.2';
UPDATE indicators SET description_ar = 'المشاركة في العمل التطوعي'
  WHERE id = '2.2.3';
UPDATE indicators SET description_ar = 'ممارسات الشورى والثقافة الانتخابية'
  WHERE id = '2.2.4';

-- 2.3
UPDATE indicators SET description_ar = 'الالتزام بأنماط الحياة السليمة والصحية'
  WHERE id = '2.3.1';
UPDATE indicators SET description_ar = 'المشاركة في قضايا البيئة والمناخ'
  WHERE id = '2.3.2';

-- 2.4
UPDATE indicators SET description_ar = 'المبادرة في طرح الأفكار وإطلاق المشروعات'
  WHERE id = '2.4.1';
UPDATE indicators SET description_ar = 'إدارة المشروعات لتحقيق النتائج'
  WHERE id = '2.4.2';
UPDATE indicators SET description_ar = 'الالتزام بأخلاقيات العمل'
  WHERE id = '2.4.3';
UPDATE indicators SET description_ar = 'التواصل وقيادة الفرق'
  WHERE id = '2.4.4';

-- 3.1
UPDATE indicators SET description_ar = 'تخطيط المنهاج الدراسي لتحقيق الكفايات وتلبية احتياجات الطلبة'
  WHERE id = '3.1.1';
UPDATE indicators SET description_ar = 'الربط بين المواد الدراسية لدعم التكامل المنهجي وربط المنهاج بثقافة سلطنة عمان'
  WHERE id = '3.1.2';
UPDATE indicators SET description_ar = 'مواءمة المنهاج بما يلبي احتياجات جميع الطلبة ويراعي التمايز بينهم'
  WHERE id = '3.1.3';

-- 3.2
UPDATE indicators SET description_ar = 'إدارة زمن التعلم'
  WHERE id = '3.2.1';
UPDATE indicators SET description_ar = 'إدارة سلوك الطلبة'
  WHERE id = '3.2.2';
UPDATE indicators SET description_ar = 'إثارة الدافعية للتعلم بما يتلاءم مع قدرات الطلبة وفئاتهم'
  WHERE id = '3.2.3';

-- 3.3
UPDATE indicators SET description_ar = 'تقديم المعلمين لمحتوى الدروس واستخدام استراتيجيات التعلم'
  WHERE id = '3.3.1';
UPDATE indicators SET description_ar = 'لغة التدريس لتعزيز التعلم'
  WHERE id = '3.3.2';
UPDATE indicators SET description_ar = 'توظيف المصادر والوسائل التعليمية بما في ذلك برامج التعلم الإلكتروني ومنصاته'
  WHERE id = '3.3.3';
UPDATE indicators SET description_ar = 'تمكين الطلبة من التعبير عن آرائهم وتطبيق ما تعلموه والتعلم من أخطائهم'
  WHERE id = '3.3.4';
UPDATE indicators SET description_ar = 'مواءمة استراتيجيات التدريس مع متطلبات ذوي الاحتياجات الخاصة والإعاقة'
  WHERE id = '3.3.5';

-- 3.4
UPDATE indicators SET description_ar = 'ربط التعلم بواقع الطلبة وحياتهم'
  WHERE id = '3.4.1';
UPDATE indicators SET description_ar = 'تعزيز القدرة على التساؤل والتفكير والتدبر بما يتعدى مساحة المواد الدراسية ويمكن من مواصلة التعلم'
  WHERE id = '3.4.2';
UPDATE indicators SET description_ar = 'تعزيز مهارات التعلم الذاتي والتعلم التعاوني'
  WHERE id = '3.4.3';
UPDATE indicators SET description_ar = 'تنمية روح المبادرة وتعزيز التكيف مع المتغيرات'
  WHERE id = '3.4.4';
UPDATE indicators SET description_ar = 'تنمية مهارات التعلم القرائية والحسابية وتعزيز ثقافة القراءة'
  WHERE id = '3.4.5';
UPDATE indicators SET description_ar = 'تنمية المهارات الرقمية'
  WHERE id = '3.4.6';

-- 3.5
UPDATE indicators SET description_ar = 'توظيف أساليب تقويم تراعي التمايز وتضمن تحقق أهداف التعلم'
  WHERE id = '3.5.1';
UPDATE indicators SET description_ar = 'تطبيق التقويمات حسب المعايير المعتمدة'
  WHERE id = '3.5.2';
UPDATE indicators SET description_ar = 'توظيف نتائج التقويم في دعم التعلم والتقدم فيه'
  WHERE id = '3.5.3';
UPDATE indicators SET description_ar = 'متابعة التقدم في تحقيق أهداف التعلم بما يراعي التمايز بين الطلبة'
  WHERE id = '3.5.4';

-- 4.1
UPDATE indicators SET description_ar = 'تدابير الأمن والسلامة وترخيصها من الجهات المختصة'
  WHERE id = '4.1.1';
UPDATE indicators SET description_ar = 'ملاءمة مرافق المدرسة لجميع الطلبة والعاملين فيها بمن فيهم ذوو الإعاقة'
  WHERE id = '4.1.2';
UPDATE indicators SET description_ar = 'نظافة مرافق المدرسة وجاذبيتها'
  WHERE id = '4.1.3';
UPDATE indicators SET description_ar = 'تجهيز المرافق التعليمية بالوسائط الآمنة المساعدة على التعلم الحضوري والتعلم عن بعد'
  WHERE id = '4.1.4';

-- 4.2
UPDATE indicators SET description_ar = 'بيئة مدرسية تشجع على اكتشاف قدرات الطلبة ومواهبهم'
  WHERE id = '4.2.1';
UPDATE indicators SET description_ar = 'تعزيز مواهب الطلبة وقدراتهم والاحتفاء بها وتطويرها بما يتماشى مع رغباتهم واحتياجاتهم'
  WHERE id = '4.2.2';

-- 4.3
UPDATE indicators SET description_ar = 'تعزيز ثقافة حقوق الطفل'
  WHERE id = '4.3.1';
UPDATE indicators SET description_ar = 'الاهتمام برعاية الطلبة نفسياً وجسدياً'
  WHERE id = '4.3.2';
UPDATE indicators SET description_ar = 'دعم ورعاية الطلبة الذين يواجهون صعوبات في تعلمهم لاحتياجاتهم الخاصة أو إعاقاتهم أو لأسباب أخرى'
  WHERE id = '4.3.3';
UPDATE indicators SET description_ar = 'تهيئة الطلبة للمسارات الأكاديمية والمهنية ودعمهم بما يتوافق مع ميولهم ومتطلبات سوق العمل'
  WHERE id = '4.3.4';
UPDATE indicators SET description_ar = 'تفهم مراحل نمو الطلبة ومتطلباتها وتهيئة الطلبة للانتقال من مرحلة تعليمية إلى أخرى'
  WHERE id = '4.3.5';

-- 4.4
UPDATE indicators SET description_ar = 'بيئة مدرسية تشجع على البحث العلمي والالتزام بأخلاقياته'
  WHERE id = '4.4.1';
UPDATE indicators SET description_ar = 'نهج المدرسة في إبراز الإنتاج البحثي للطلبة وتقديره'
  WHERE id = '4.4.2';

-- 5.1
UPDATE indicators SET description_ar = 'رؤية ورسالة يشارك المجتمع المدرسي في بنائهما وتنفيذهما'
  WHERE id = '5.1.1';
UPDATE indicators SET description_ar = 'التقويم الذاتي وتوظيفه في التخطيط الاستراتيجي وتحسين الأداء'
  WHERE id = '5.1.2';
UPDATE indicators SET description_ar = 'العمل المشترك والتواصل الفاعل مع المجتمع المدرسي لدعم عمليات التحسين'
  WHERE id = '5.1.3';
UPDATE indicators SET description_ar = 'توقعات عالية تجاه العاملين بالمدرسة والطلبة'
  WHERE id = '5.1.4';

-- 5.2
UPDATE indicators SET description_ar = 'إلمام قيادة المدرسة بالمناهج وممارسات التدريس الضرورية لتحقيق أهداف التعلم'
  WHERE id = '5.2.1';
UPDATE indicators SET description_ar = 'الإشراف على عمليتي التعليم والتعلم بما يدعم تعلم الطلبة ويراعي التمايز بينهم'
  WHERE id = '5.2.2';
UPDATE indicators SET description_ar = 'إنماء مهني للمعلمين موجه لتجويد التدريس ورفع مستوى أداء الطلبة'
  WHERE id = '5.2.3';
UPDATE indicators SET description_ar = 'إشراك الطلبة في تحسين عمليات التعليم'
  WHERE id = '5.2.4';
UPDATE indicators SET description_ar = 'تكوين مجتمعات تعلم مهنية داخل المدرسة ومع المدارس الأخرى'
  WHERE id = '5.2.5';

-- 5.3
UPDATE indicators SET description_ar = 'إدارة الموارد المالية بما يخدم تعلم جميع الطلبة'
  WHERE id = '5.3.1';
UPDATE indicators SET description_ar = 'الاستخدام الفاعل للمرافق المدرسية والوسائل التعليمية'
  WHERE id = '5.3.2';
UPDATE indicators SET description_ar = 'تنظيم الأدوار والمسؤوليات'
  WHERE id = '5.3.3';
UPDATE indicators SET description_ar = 'إدارة الموارد البشرية ورفع كفاءتها المهنية'
  WHERE id = '5.3.4';

-- 5.4
UPDATE indicators SET description_ar = 'إشراك أولياء الأمور في الحياة المدرسية'
  WHERE id = '5.4.1';
UPDATE indicators SET description_ar = 'تمكين أولياء الأمور من دعم تعلم أبنائهم'
  WHERE id = '5.4.2';
UPDATE indicators SET description_ar = 'الشراكة مع مؤسسات المجتمع بما يسهم في الارتقاء بالحياة المدرسية ودعم نواتج التعلم'
  WHERE id = '5.4.3';

-- 5.5
UPDATE indicators SET description_ar = 'المساءلة وفق الأدوار والمسؤوليات'
  WHERE id = '5.5.1';
UPDATE indicators SET description_ar = 'تطبيق السياسات والأنظمة واللوائح المنظمة للعمل في المدرسة'
  WHERE id = '5.5.2';
UPDATE indicators SET description_ar = 'الشفافية في توفير البيانات ومشاركتها'
  WHERE id = '5.5.3';
