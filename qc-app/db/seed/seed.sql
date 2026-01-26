-- Insert Test User (password: password123)
-- In a real app, hash this properly. This is for dev/demo.
INSERT INTO users (email, password_hash, name, role) VALUES 
('admin@example.com', 'password123', 'Admin User', 'admin');

-- Insert Projects
INSERT INTO projects (name, description) VALUES 
('Alpha QC', 'Quality control for Alpha line'),
('Beta Testing', 'Beta product testing phase');

-- Insert Resources
INSERT INTO resources (name, role) VALUES 
('Alice Inspector', 'Senior Inspector'),
('Bob Checker', 'Junior Inspector');

-- Insert Tasks
INSERT INTO tasks (project_id, title, description, assigned_resource_id, status) VALUES 
((SELECT id FROM projects WHERE name='Alpha QC'), 'Inspect Batch A1', 'Check for defects', (SELECT id FROM resources WHERE name='Alice Inspector'), 'pending'),
((SELECT id FROM projects WHERE name='Beta Testing'), 'Verify Dimensions', 'Measure x,y,z', (SELECT id FROM resources WHERE name='Bob Checker'), 'in_progress');
