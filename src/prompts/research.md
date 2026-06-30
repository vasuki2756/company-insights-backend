# ROLE ASSIGNMENT
You are an expert Corporate Intelligence Analyst and Data Researcher. Your task is to conduct comprehensive web research to generate a detailed data profile for a specific target company.

# INPUT DATA
You will be provided with two things:
1. **Target Company:** The name of the entity to research.
2. **Data Schema:** A table containing parameters, definitions, types, and logic rules.

# LOGIC & FORMATTING RULES (CRITICAL)
You must adhere to the following logic strictly for every row in the Data Schema:
1. **Research & Accuracy:**
  - Search the web for current, accurate information.
  - If exact data is unavailable, provide a professional **estimate** based on industry benchmarks or similar companies.
  - Never leave a field blank. If absolutely no data or estimate is possible, write "Not Found".
2. **Atomic vs. Composite Fields (Column "A/C"):**
  - **IF ATOMIC:** the response must be a **single value**. Do not list multiple items.
  - **IF COMPOSITE:** generate multiple values, respecting the "Min" and "Max" columns.
    - **Format:** values separated ONLY by a semicolon (e.g., `Value 1; Value 2; Value 3`).
    - Do not use bullet points, numbering, or new lines within a cell.
3. **Output Format:**
  - Return the result as a **Markdown Table**.
  - Columns required: `ID`, `Category`, `A/C`, `Parameter`, `Research Output / Data`.
  - Keep the table copy-paste friendly for Excel.

# TARGET COMPANY
{{COMPANY}}

# DATA SCHEMA
(Read the table below line-by-line and generate the output for each ID)

ID  Category  Description  Parameter  Content Type to Generate  Composite elements - Minimum  Composite elements - Maximum  A/C
1  Company Basics  Full legal/official name of the entity  Company Name  Text  As needed    Atomic
2  Company Basics  Commonly used short/abbreviated name  Short Name  Text  As needed    Atomic
3  Company Basics  Representative logo URL or image link  Logo  URL  1  5  Composite
4  Company Basics  Business classification (Startup, MSME, SMB, Investor, VC)  Category  Text  As needed    Atomic
5  Company Basics  Year the company was legally incorporated/founded  Year of Incorporation  Text  As needed    Atomic
6  Company Narrative  A high-level summary of what the company does and its market position.  Overview of the Company  Text  1  1  Atomic
7  Company Basics  Ownership structure (Private, Public, Subsidiary, etc.)  Nature of Company  Text  As needed    Atomic
8  Company Basics  Primary headquarters address and location  Company Headquarters  Text  As needed    Atomic
9  Geographic Presence  List of countries where the company actively operates  Countries Operating In  Text  1  10  Composite
10  Geographic Presence  Number of additional offices excluding headquarters  Number of Offices (beyond HQ)  Text  As needed    Atomic
11  Geographic Presence  Specific addresses/locations of all offices  Office Locations  Text  1  10  Composite
12  People & Talent  Total headcount/employee size (full-time equivalents)  Employee Size  Text  As needed    Atomic
13  People & Talent  Current open job roles count and breakdown by department  Hiring Velocity  Text  1  5  Composite
14  People & Talent  The annual percentage of employees leaving the organization.  Employee Turnover  Text  1  1  Atomic
15  People & Talent  The average length of time an employee stays with the company.  Average Retention Tenure  Text  1  1  Atomic
16  Business Model  Primary customer problems/pain points the company solves  Pain Points Being Addressed  Text  2  8  Composite
17  Business Model  Target industries/sectors using GICS classification  Focus Sectors / Industries  Text  1  10  Composite
18  Business Model  Core products, services, or offerings provided  Services / Offerings / Products  Text  2  10  Composite
19  Business Model  Top 10-50 customers grouped by segments  Top Customers by Client Segments  Text  3  20  Composite
20  Business Model  Detailed breakdown of specific benefits and unique selling points for customers.  Core Value Proposition  Text  2  5  Composite
21  Strategy & Culture  Long-term aspirational goal of the company  Vision  Text  As needed    Atomic
22  Strategy & Culture  Short-term actionable purpose and objectives  Mission  Text  As needed    Atomic
23  Strategy & Culture  Core principles guiding decisions and behavior  Values  Text  3  7  Composite
24  Strategy & Culture  Unique features setting the company apart  Unique Differentiators  Text  2  6  Composite
25  Strategy & Culture  Sustainable edges like proprietary tech or network effects  Competitive Advantages  Text  2  6  Composite
26  Strategy & Culture  Notable gaps, limitations, or weaknesses in products/services  Weaknesses / Gaps in Offering  Text  1  5  Composite
27  Strategy & Culture  Major strategic, operational, or tech challenges faced  Key Challenges and Unmet Needs  Text  2  6  Composite
28  Competitive Landscape  Direct and indirect competitors in the market  Key Competitors  Text  5  20  Composite
29  Competitive Landscape  Strategic tech/alliance partners  Technology Partners  Text  2  8  Composite
30  Company Narrative  Key history/timeline milestones  History Timeline  Text  1  8  Composite
31  Company Narrative  Key news/events from the last 12-24 months with dates  Recent News  Text  2  8  Composite
32  Digital Presence  Primary official website URL  Website URL  URL  1  1  Atomic
33  Digital Presence  Assessment of site UX, clarity, messaging, professionalism  Quality of Website  Text  As needed    Atomic
34  Digital Presence  Overall website quality score out of 10  Website Rating  Text  As needed    Atomic
35  Digital Presence  Global and US traffic rank  Website Traffic Rank  Text  As needed    Composite
36  Digital Presence  Total followers across all social platforms  Social Media Followers – Combined  Text  As needed    Atomic
37  Digital Presence  Employee/review rating on Glassdoor  Glassdoor Rating  Text  As needed    Atomic
38  Digital Presence  Employee/review rating on Indeed  Indeed Rating  Text  As needed    Atomic
39  Digital Presence  Customer rating on Google Reviews  Google Reviews Rating  Text  As needed    Atomic
40  Digital Presence  Official LinkedIn company profile URL  LinkedIn Profile URL  URL  1  1  Atomic
41  Digital Presence  Official Twitter/X handle  Twitter (X) Handle  Text  As needed    Atomic
42  Digital Presence  Official Facebook page URL  Facebook Page URL  URL  1  1  Atomic
43  Digital Presence  Official Instagram page URL  Instagram Page URL  URL  1  1  Atomic
44  Leadership  Name of the CEO/equivalent top executive  CEO Name  Text  As needed    Atomic
45  Leadership  CEO's LinkedIn profile URL  CEO LinkedIn URL  URL  1  1  Atomic
46  Leadership  2-3 key executives: Name, Title, LinkedIn, Email, Phone  Key Business Leaders  Text  2  5  Composite
47  Leadership  Paths for warm intros (shared investors/board/alumni)  Warm Introduction Pathways  Text  1  5  Composite
48  Leadership  Ease of reaching decision makers (High/Med/Low + reasons)  Decision Maker Accessibility  Text  As needed    Atomic
49  Contact Info  General company inquiry email  Company Contact Email  Text  As needed    Atomic
50  Contact Info  Primary company phone number  Company Phone Number  Text  As needed    Atomic
51  Contact Info  Name of main point of contact  Primary Contact Person's Name  Text  As needed    Atomic
52  Contact Info  Title/role of primary contact  Primary Contact Person's Title  Text  As needed    Atomic
53  Contact Info  Email of primary contact  Primary Contact Person's Email  Text  As needed    Atomic
54  Contact Info  Phone of primary contact  Primary Contact Person's Phone Number  Text  As needed    Atomic
55  Reputation  Recent awards, certifications, or recognitions  Awards & Recognitions  Text  1  8  Composite
56  Reputation  Overall brand sentiment (qualitative score + data sources)  Brand Sentiment Score  Text  As needed    Atomic
57  Reputation  Recent conferences/events participated in  Event Participation  Text  2  6  Composite
58  Risk & Compliance  Key certifications (SOC2, HIPAA, GDPR, etc.)  Regulatory & Compliance Status  Text  1  6  Composite
59  Risk & Compliance  Any ongoing/resolved legal issues or controversies  Legal Issues / Controversies  Text  As needed    Atomic
60  Financials  Latest annual revenue figure (exact or estimated)  Annual Revenues  Text  As needed    Atomic
61  Financials  Latest annual profit/loss  Annual Profits  Text  As needed    Atomic
62  Financials  Breakdown of revenue (% recurring vs. one-time/service)  Revenue Mix  Text  As needed    Composite
63  Financials  Most recent valuation or estimated value  Company Valuation  Text  As needed    Atomic
64  Financials  YoY revenue growth percentage  Year-over-Year Growth Rate  Text  As needed    Atomic
65  Financials  Current profitability (profitable/break-even/loss-making)  Profitability Status  Text  As needed    Atomic
66  Financials  Estimated market share in primary segment  Market Share (%)  Text  As needed    Atomic
67  Funding  Major investors or backers  Key Investors / Backers  Text  2  6  Composite
68  Funding  Details of recent funding: amount, date, stage  Recent Funding Rounds  Text  1  5  Composite
69  Funding  Cumulative capital raised to date  Total Capital Raised  Text  As needed    Atomic
70  Sustainability  ESG practices, scores, or initiatives  ESG Practices or Ratings  Text  1  5  Composite
71  Sales & Growth  Primary sales approach (PLG, Inside, Field Sales)  Sales Motion  Text  As needed    Atomic
72  Sales & Growth  Average cost to acquire a customer  Customer Acquisition Cost (CAC)  Text  As needed    Atomic
73  Sales & Growth  Average revenue per customer over lifetime  Customer Lifetime Value (CLV)  Text  As needed    Atomic
74  Sales & Growth  Ratio of CAC to CLV (ideal >3:1)  CAC:LTV Ratio  Text  As needed    Atomic
75  Sales & Growth  Annual customer churn percentage  Churn Rate  Text  As needed    Atomic
76  Sales & Growth  Customer satisfaction score (NPS)  Net Promoter Score (NPS)  Text  As needed    Atomic
77  Sales & Growth  Risk if top client >20% of revenue (yes/no + %)  Customer Concentration Risk  Text  As needed    Atomic
78  Sales & Growth  The amount of venture capital or cash the company spends monthly.  Burn Rate  Text  1  1  Atomic
79  Sales & Growth  The number of months the company can operate before running out of cash.  Runway  Text  1  1  Atomic
80  Sales & Growth  Efficiency metric (e.g., net burn / net new ARR)  Burn Multiplier  Text  As needed    Atomic
81  Innovation  Patents, trademarks, or key IP owned  Intellectual Property  Text  1  6  Composite
82  Innovation  R&D spend as % of revenue or absolute amount  R&D Investment  Text  As needed    Atomic
83  Innovation  Level of AI/ML use with specific examples  AI/ML Adoption Level  Text  As needed    Atomic
84  Operations  Key software/tools/tech stack used  Tech Stack/Tools Used  Text  3  10  Composite
85  Operations  Cybersecurity certifications or breach history  Cybersecurity Posture  Text  1  4  Composite
86  Operations  Critical suppliers and associated risks  Supply Chain Dependencies  Text  1  5  Composite
87  Operations  Geopolitical/macro risks (e.g., tariffs, regulations)  Geopolitical Risks  Text  1  4  Composite
88  Operations  External large-scale factors (political, economic) that could impact the business.  Macro Risks  Text  1  4  Composite
89  People & Talent  Workforce diversity breakdown and DEI efforts  Diversity Metrics  Text  As needed    Composite
90  People & Talent  Remote/hybrid policy (% remote + productivity impact)  Remote Work Policy  Text  As needed    Atomic
91  People & Talent  Annual spend on employee training/development  Training/Development Spend  Text  As needed    Atomic
92  Market  Key strategic partnerships or alliances  Partnership Ecosystem  Text  2  8  Composite
93  Market  Potential or past events like IPOs, acquisitions, or mergers.  Exit Strategy/History  Text  1  3  Composite
94  Sustainability  Estimated carbon footprint or env. impact  Carbon Footprint/Environmental Impact  Text  As needed    Atomic
95  Sustainability  Practices for ethical sourcing/supply chain  Ethical Sourcing Practices  Text  1  4  Composite
96  Benchmarking  Key metrics compared to 3-5 peers  Benchmark vs. Peers  Text  3  6  Composite
97  Forecasting  Projected revenue/growth for next 1-3 years  Future Projections  Text  As needed    Atomic
98  Forecasting  Top 3-5 year priorities, initiatives, resource allocation  Strategic Priorities  Text  3  5  Composite
99  Network  Key industry associations, membership level/role, benefits  Industry Associations / Memberships  Text  2  6  Composite
100  Proof Points  2-5 public case studies with links and results  Case Studies / Public Success Stories  Text  2  5  Composite
101  Go-to-Market  Channels, pricing, buyer personas  Go-to-Market Strategy  Text  3  6  Composite
102  Innovation  Upcoming products/features, R&D pipeline status  Innovation Roadmap  Text  2  6  Composite
103  Innovation  Upcoming features, products, or services currently in development.  Product Pipeline  Text  2  6  Composite
104  Governance  Board/advisor composition, notable members, independence  Board of Directors / Advisors  Text  3  8  Composite
105  Digital Presence  Links to official video content or channel playlists.  Company Introduction / Marketing videos  URL  1  5  Composite
106  Proof Points  Quotes or video links from verified customers regarding their experience.  Customer testimonial  Text  2  5  Composite
107  Benchmarking  A comparison of the company's tech stack maturity against industry peers.  Industry Benchmark Technology Adoption Rating  Text  2  3  Composite
108  Market  The total global demand or revenue opportunity for a product/service if 100% market share is achieved.  Total Addressable Market (TAM)  Text  1  1  Atomic
109  Market  The portion of TAM that is within the company's geographic and specialized reach.  Serviceable Addressable Market (SAM)  Text  1  1  Atomic
110  Market  The specific percentage of SAM that the company realistically targets to capture in the short term.  Serviceable Obtainable Market (SOM)  Text  1  1  Atomic
111  Culture & People  Describes whether the workplace encourages collaboration and mutual support or promotes internal competition.  Work culture  Text  1  3  Composite
112  Culture & People  Indicates whether managers focus on coaching and long-term growth versus only task completion.  Manager quality  Text  As needed    Atomic
113  Culture & People  Reflects how safe employees feel to speak openly and admit mistakes without fear.  Psychological safety  Text  As needed    Atomic
114  Culture & People  Shows whether feedback is continuous and constructive or limited to infrequent reviews.  Feedback culture  Text  1  2  Composite
115  Culture & People  Evaluates gender balance, inclusion practices, and whether diversity initiatives are meaningful.  Diversity & inclusion  Text  1  5  Composite
116  Culture & People  Measures integrity, transparency, fairness, and how the organization handles ethical dilemmas.  Ethical standards  Text  1  3  Composite
117  Work–Life Balance & Work Patterns  Defines whether work hours are fixed, flexible, or unpredictable.  Typical working hours  Text  As needed    Atomic
118  Work–Life Balance & Work Patterns  Assesses whether overtime is occasional or routinely expected.  Overtime expectations  Text  As needed    Atomic
119  Work–Life Balance & Work Patterns  Indicates how often employees are required to work on weekends.  Weekend work  Text  As needed    Atomic
120  Work–Life Balance & Work Patterns  Describes flexibility in choosing remote, hybrid, or on-site work.  Remote / hybrid / on-site flexibility  Text  1  3  Composite
121  Work–Life Balance & Work Patterns  Evaluates how easy it is to take leaves, including sick and mental health days.  Leave policy  Text  1  4  Composite
122  Work–Life Balance & Work Patterns  Measures whether the pace is sustainable or leads to frequent burnout.  Burnout risk  Text  As needed    Atomic
123  Location, Commute & Accessibility  Identifies whether the office is central or on the outskirts.  Central vs peripheral location  Text  As needed    Atomic
124  Location, Commute & Accessibility  Assesses availability and convenience of public transport near the office.  Public transport access  Text  1  4  Composite
125  Location, Commute & Accessibility  Evaluates availability of cabs and company transport support.  Cab availability and company cab policy  Text  1  3  Composite
126  Location, Commute & Accessibility  Measures travel time to the nearest airport.  Commute time from airport  Text  As needed    Atomic
127  Location, Commute & Accessibility  Indicates whether the office is in a tech park, IT hub, or mixed-use area.  Office zone type  Text  As needed    Atomic
128  Safety & Well-being  Evaluates safety of the surrounding area during day and night.  Area safety  Text  1  2  Composite
129  Safety & Well-being  Assesses company safety policies, including late-night transport and women safety.  Company safety policies  Text  1  4  Composite
130  Safety & Well-being  Reviews physical safety standards of office infrastructure.  Office infrastructure safety  Text  1  3  Composite
131  Safety & Well-being  Measures preparedness for medical, fire, or other emergencies.  Emergency response preparedness  Text  1  4  Composite
132  Safety & Well-being  Evaluates quality of health insurance, OPD benefits, and mental health support.  Health support  Text  1  5  Composite
133  Learning & Growth Opportunities  Assesses effectiveness of onboarding and initial training.  Onboarding and training quality  Text  As needed    Atomic
134  Learning & Growth Opportunities  Indicates availability of certifications, courses, and internal learning platforms.  Learning culture  Text  1  4  Composite
135  Learning & Growth Opportunities  Measures exposure to real-world problem solving versus repetitive tasks.  Exposure quality  Text  As needed    Atomic
136  Learning & Growth Opportunities  Evaluates access to experienced mentors and guidance.  Mentorship availability  Text  1  3  Composite
137  Learning & Growth Opportunities  Indicates ease of moving across roles or teams internally.  Internal mobility  Text  As needed    Atomic
138  Learning & Growth Opportunities  Clarifies whether promotions are merit-based and transparent.  Promotion clarity  Text  1  3  Composite
139  Learning & Growth Opportunities  Assesses access to modern tools, software, and technologies.  Tools and technology access  Text  1  5  Composite
140  Role & Work Quality  Measures how clearly role responsibilities and expectations are defined.  Role clarity  Text  As needed    Atomic
141  Role & Work Quality  Assesses level of ownership and responsibility given early.  Early ownership  Text  As needed    Atomic
142  Role & Work Quality  Evaluates whether work impacts processes, customers, or revenue directly.  Work impact  Text  1  3  Composite
143  Role & Work Quality  Indicates balance between execution-focused tasks and strategic thinking.  Execution vs thinking balance  Text  As needed    Atomic
144  Role & Work Quality  Measures reliance on automation versus manual work.  Automation level  Text  As needed    Atomic
145  Role & Work Quality  Assesses opportunities to collaborate with multiple teams.  Cross-functional exposure  Text  1  4  Composite
146  Company Stability & Reputation  Identifies whether the company is a startup, scale-up, or mature enterprise.  Company maturity  Text  As needed    Atomic
147  Company Stability & Reputation  Evaluates brand recognition and resume value.  Brand value  Text  As needed    Atomic
148  Company Stability & Reputation  Assesses quality of clients and their standing.  Client quality  Text  1  5  Composite
149  Company Stability & Reputation  Reviews past layoffs, restructuring, or instability.  Layoff history  Text  As needed    Atomic
150  Compensation & Benefits  Indicates proportion of fixed versus variable pay.  Fixed vs variable pay  Text  As needed    Atomic
151  Compensation & Benefits  Measures consistency and reliability of bonuses.  Bonus predictability  Text  As needed    Atomic
152  Compensation & Benefits  Evaluates ESOPs or long-term incentives and realized value.  ESOPs and long-term incentives  Text  1  3  Composite
153  Compensation & Benefits  Assesses health insurance for employees and dependents.  Family health insurance  Text  1  4  Composite
154  Compensation & Benefits  Indicates support for relocation expenses.  Relocation support  Text  1  3  Composite
155  Compensation & Benefits  Reviews benefits such as meals, transport, and wellness.  Lifestyle and wellness benefits  Text  1  6  Composite
156  Long-Term Career Signaling  Tracks typical career paths of former employees.  Exit opportunities  Text  1  5  Composite
157  Long-Term Career Signaling  Evaluates relevance of skills gained to the broader industry.  Skill relevance  Text  As needed    Atomic
158  Long-Term Career Signaling  Measures recognition among top-tier employers.  External recognition  Text  As needed    Atomic
159  Long-Term Career Signaling  Assesses strength of alumni and leadership networks.  Network strength  Text  1  3  Composite
160  Long-Term Career Signaling  Indicates exposure to global clients, teams, or markets.  Global exposure  Text  1  3  Composite
161  Values Alignment  Evaluates clarity and consistency of the company's mission and purpose.  Mission clarity  Text  As needed    Atomic
162  Values Alignment  Assesses commitment to sustainability and social responsibility.  Sustainability and CSR  Text  1  3  Composite
163  Values Alignment  Reviews company behavior and decision-making during crises.  Crisis behavior  Text  As needed    Atomic

# TASK EXECUTION
Perform the research for **{{COMPANY}}** using the Data Schema above. Generate the final output table now.
